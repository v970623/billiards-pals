import { Application, Router } from "https://deno.land/x/oak@v11.1.0/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.0/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);
db.execute(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    UNIQUE(user_id, link_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(link_id) REFERENCES links(id)
  )
`);

// Insert test data with encrypted password
const hashedPassword = await bcrypt.hash("12345678");
db.query(
  `
  INSERT OR IGNORE INTO users (username, password) VALUES 
  ('user1', ?),
  ('user2', ?),
  ('user3', ?)
`,
  [hashedPassword, hashedPassword, hashedPassword]
);

db.query(`
  INSERT OR IGNORE INTO links (title, description, user_id) VALUES 
  ('Top 10 Billiards Tips', 'Improve your billiards skills!', 1),
  ('Amazing Trick Shots', 'Must-watch video!', 2),
  ('Best Pool Cues', 'Top 5 cues for professionals.', 3),
  ('Billiards Strategy Guide', 'Learn advanced strategies and techniques', 1),
  ('Equipment Maintenance Tips', 'How to take care of your billiards equipment', 2)
`);

db.query(`
  INSERT OR IGNORE INTO ratings (user_id, link_id, rating) VALUES
  (1, 2, 5),
  (1, 3, 4),
  (1, 5, 5),
  (2, 1, 4),
  (2, 3, 5),
  (2, 4, 3),
  (3, 1, 5),
  (3, 2, 4),
  (3, 4, 5),
  (3, 5, 4)
`);

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
  const { value } = await context.request.body({ type: "json" });
  const { username, password } = await value;

  const result = db.query("SELECT * FROM users WHERE username = ?", [username]);
  const user = result.length
    ? {
        id: result[0][0],
        username: result[0][1],
        password: result[0][2],
        billiards_points: result[0][3],
      }
    : null;
  if (user && (await bcrypt.compare(password, user.password))) {
    console.log("[API] Login successful for user:", username);
    context.response.status = 200;
    context.response.body = { message: "Login successful", user };
  } else {
    console.log("[API] Login failed - Invalid credentials for user:", username);
    context.response.status = 401;
    context.response.body = { error: "Invalid credentials" };
  }
});

// Get all links endpoint
router.get("/links", (context) => {
  console.log("[API] Fetching all links");
  const links = db.query("SELECT * FROM links");
  console.log("[API] Retrieved", links.length, "links");
  context.response.body = links;
});

// Add new link endpoint
router.post("/links", async (context) => {
  console.log("[API] Received new link submission");
  const { value } = await context.request.body({ type: "json" });
  const { title, description, user_id } = await value;

  db.query("INSERT INTO links (title, description, user_id) VALUES (?, ?, ?)", [
    title,
    description,
    user_id,
  ]);
  console.log("[API] New link added successfully by user:", user_id);
  context.response.status = 201;
  context.response.body = { message: "Link added successfully" };
});

app.use(router.routes());
app.use(router.allowedMethods());

// Start server
console.log("Server is running on http://localhost:8001");
await app.listen({ port: 8001 });
