import { Application, Router } from "https://deno.land/x/oak@v11.1.0/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.0/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts";

// Initialize SQLite database
const db = new DB("./database/ITECH3108_30407368_a2.sqlite");
export default db;

// Create tables
db.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    billiards_points INTEGER DEFAULT 0
  )
`);
db.execute(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hidden BOOLEAN DEFAULT 0,
    rating INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);
db.execute(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    is_good BOOLEAN NOT NULL,
    UNIQUE(user_id, link_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(link_id) REFERENCES links(id)
  )
`);

// Insert test data with encrypted password
const userCount = db.query("SELECT COUNT(*) as count FROM users");
if (userCount[0][0] === 0) {
  const hashedPassword = await bcrypt.hash("12345678");
  db.query(
    `
    INSERT INTO users (username, password, billiards_points) VALUES 
    ('user1', ?, 10),
    ('user2', ?, 15),
    ('user3', ?, 20)
  `,
    [hashedPassword, hashedPassword, hashedPassword]
  );
  // Insert test links
  db.query(`
    INSERT INTO links (title, description, user_id, created_at, hidden, rating) VALUES 
    ('Top 10 Billiards Tips', 'Improve your billiards skills!', 1, '2023-10-01 10:30:00', 0, 1),
    ('Amazing Trick Shots', 'Must-watch video!', 2, '2023-10-02 15:45:00', 0, 2), 
    ('Best Pool Cues', 'Top 5 cues for professionals.', 3, '2023-10-03 09:15:00', 0, 2),
    ('Billiards Strategy Guide', 'Learn advanced strategies and techniques', 1, '2023-10-04 14:20:00', 0, 0),
    ('Equipment Maintenance Tips', 'How to take care of your billiards equipment', 2, '2023-10-05 11:50:00', 0, 1)
  `);

  // Insert test ratings
  db.query(`
    INSERT INTO ratings (user_id, link_id, is_good) VALUES
    (1, 2, true),
    (1, 3, true), 
    (1, 5, true),
    (2, 1, true),
    (2, 3, true),
    (2, 4, false),
    (3, 1, true),
    (3, 2, true),
    (3, 4, true),
    (3, 5, true)
  `);
}

console.log("Database initialized with test data.");

const app = new Application();
const router = new Router();

// Configure static file service
app.use(async (context, next) => {
  try {
    await context.send({
      root: `${Deno.cwd()}/public`,
      index: "index.html",
    });
  } catch {
    await next();
  }
});

// Register endpoint
router.post("/register", async (context) => {
  console.log("[API] Received registration request");
  const { value } = await context.request.body({ type: "json" });
  const { username, password } = await value;

  try {
    // Encrypt password
    const hashedPassword = await bcrypt.hash(password);
    db.query("INSERT INTO users (username, password) VALUES (?, ?)", [
      username,
      hashedPassword,
    ]);
    console.log("[API] User registered successfully:", username);
    context.response.status = 201;
    context.response.body = { message: "User registered successfully" };
  } catch (error) {
    console.log(
      "[API] Registration failed - Username already exists:",
      username
    );
    context.response.status = 400;
    context.response.body = { error: "Username already exists" };
  }
});

// Login endpoint
router.post("/login", async (context) => {
  console.log("[API] Received login request");

  try {
    const body = await context.request.body().value;
    const { username, password } = body;

    const result = db.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (result && result.length > 0) {
      const user = {
        id: result[0][0] as number,
        username: result[0][1] as string,
        password: result[0][2] as string,
      };

      if (await bcrypt.compare(password as string, user.password)) {
        console.log("[API] Login successful for user:", username);

        const token = await new SignJWT({ id: user.id })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("24h")
          .sign(new TextEncoder().encode("your-secret-key"));

        context.response.body = { token };
        context.response.status = 200;
      } else {
        console.log("[API] Login failed - invalid password");
        context.response.status = 401;
        context.response.body = { error: "Invalid credentials" };
      }
    } else {
      console.log("[API] Login failed - user not found");
      context.response.status = 401;
      context.response.body = { error: "Invalid credentials" };
    }
  } catch (error) {
    console.error("[API] Login error:", error);
    context.response.status = 500;
    context.response.body = { error: "Internal server error" };
  }
});

// Get all links endpoint
router.get("/links", (context) => {
  const sort = context.request.url.searchParams.get("sort");

  // 修改查询语句
  const query =
    sort === "highest"
      ? `
      SELECT l.*, COUNT(r.id) as rating_count,
        SUM(CASE WHEN r.is_good = 1 THEN 1 ELSE -1 END) as total_rating
      FROM links l
      LEFT JOIN ratings r ON l.id = r.link_id
      WHERE l.hidden = 0
      GROUP BY l.id
      ORDER BY total_rating DESC, l.created_at DESC
    `
      : `
      SELECT l.*, COUNT(r.id) as rating_count,
        SUM(CASE WHEN r.is_good = 1 THEN 1 ELSE -1 END) as total_rating
      FROM links l
      LEFT JOIN ratings r ON l.id = r.link_id
      WHERE l.hidden = 0
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;

  try {
    const links = db.query(query);
    context.response.body = links;
  } catch (error) {
    console.error("Failed to fetch links:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to fetch links" };
  }
});

// Add new link endpoint
router.post("/links", async (context) => {
  console.log("[API] Received new link submission");
  const { value } = await context.request.body({ type: "json" });
  const { title, description, user_id } = await value;

  db.query(
    "INSERT INTO links (title, description, user_id, hidden, rating) VALUES (?, ?, ?, 0, 0)",
    [title, description, user_id]
  );
  console.log("[API] New link added successfully by user:", user_id);
  context.response.status = 201;
  context.response.body = { message: "Link added successfully" };
});

// Rate link endpoint
router.post("/rate", async (context) => {
  const { value } = await context.request.body({ type: "json" });
  const { link_id, user_id, is_good } = await value;

  try {
    const existingRating = db.query(
      "SELECT * FROM ratings WHERE user_id = ? AND link_id = ?",
      [user_id, link_id]
    );

    if (existingRating && existingRating.length > 0) {
      context.response.status = 400;
      context.response.body = { error: "You have already rated this link" };
      return;
    }

    db.query(
      "INSERT INTO ratings (link_id, user_id, is_good) VALUES (?, ?, ?)",
      [link_id, user_id, is_good]
    );

    // Update user points - add 2 points for good rating (is_good=true), subtract 1 point for bad rating (is_good=false)
    db.query(
      `UPDATE users SET billiards_points = billiards_points + ? 
       WHERE id = (SELECT user_id FROM links WHERE id = ?)`,
      [is_good ? 1 : -1, link_id]
    );

    // Update link rating
    db.query(`UPDATE links SET rating = rating + ? WHERE id = ?`, [
      is_good ? 1 : -1,
      link_id,
    ]);

    context.response.status = 201;
    context.response.body = { message: "Rating added successfully" };
  } catch (error) {
    console.error("Failed to add rating:", error);
    context.response.status = 400;
    context.response.body = { error: "Failed to add rating" };
  }
});

// Hide link endpoint
router.post("/hide", async (context) => {
  const { value } = await context.request.body({ type: "json" });
  const { link_id, user_id } = await value;

  try {
    const link = db.query("SELECT * FROM links WHERE id = ? AND user_id = ?", [
      link_id,
      user_id,
    ]);

    if (link && link.length > 0) {
      db.query("UPDATE links SET hidden = NOT hidden WHERE id = ?", [link_id]);
      context.response.status = 200;
      context.response.body = {
        message: "Link visibility toggled successfully",
      };
    } else {
      context.response.status = 403;
      context.response.body = { error: "Unauthorized to modify this link" };
    }
  } catch (error) {
    console.error("Failed to toggle link visibility:", error);
    context.response.status = 500;
    context.response.body = { error: "Internal server error" };
  }
});

router.get("/ratings/:userId", (context) => {
  const userId = context.params.userId;
  const ratings = db.query(
    "SELECT link_id, is_good FROM ratings WHERE user_id = ?",
    [userId]
  );
  context.response.body = ratings;
});

// Get user info endpoint
router.get("/user/:userId", (context) => {
  const userId = context.params.userId;

  try {
    const user = db.query(
      "SELECT id, username, billiards_points FROM users WHERE id = ?",
      [userId]
    );

    if (user && user.length > 0) {
      context.response.body = {
        id: user[0][0],
        username: user[0][1],
        billiards_points: user[0][2],
      };
    } else {
      context.response.status = 404;
      context.response.body = { error: "User not found" };
    }
  } catch (error) {
    console.error("Failed to fetch user info:", error);
    context.response.status = 500;
    context.response.body = { error: "Internal server error" };
  }
});

// Get user favorites endpoint
router.get("/favorites/:userId", (context) => {
  const userId = context.params.userId;

  try {
    const query = `
      SELECT l.*, COUNT(r2.id) as rating_count,
        SUM(CASE WHEN r2.is_good = 1 THEN 1 ELSE -1 END) as total_rating
      FROM links l
      INNER JOIN ratings r1 ON l.id = r1.link_id AND r1.user_id = ? AND r1.is_good = 1
      LEFT JOIN ratings r2 ON l.id = r2.link_id
      WHERE l.hidden = 0
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;

    const favorites = db.query(query, [userId]);
    context.response.body = favorites;
  } catch (error) {
    console.error("Failed to fetch favorites:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to fetch favorites" };
  }
});

// Middleware to check if user is logged in
app.use(router.routes());
app.use(router.allowedMethods());

// Start server
console.log("Server is running on http://localhost:8001");
await app.listen({ port: 8001 });
