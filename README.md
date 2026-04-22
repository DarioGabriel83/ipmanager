# IP Manager

## 📖 Overview
**IP Manager** is a web application designed to manage IP addresses securely and centrally. It allows users to keep an orderly record of IP addresses with their respective comments, ensuring there are no duplicates and applying validation rules for formats (IPv4, IPv6, and CIDR notation).

Additionally, it features a robust role-based authentication and authorization system, and brute-force attack protection (rate limiting). All storage is local using small files hosted in the `db` folder (`users.txt` and `ips.txt`).

---

## 🚀 How the Web App Works
The frontend application is built with HTML, CSS, and vanilla JavaScript, communicating with a Node.js/Express.js server via a RESTful API.

### 🔑 Authentication and Authorization
The application allows the creation of new accounts, with the particularity that the **first user registered in the system automatically becomes an Administrator with an "Active" status**. All users created thereafter are "Regular Users" by default, and their accounts remain in a "Pending" status until approved by the administrator.

Once validated, the system uses **JSON Web Tokens (JWT)** to maintain stable user sessions, guaranteeing access to protected routes.

### 🛡️ Attempt Protection (Rate Limiting)
The system monitors failed login attempts on its backend:
- If the password fails **5 times**, the user's IP will be blocked for **1 hour**.
- If the user persists and incurs another 5 failed attempts after the block is lifted, the system will progressively escalate the block exponentially (2 hours, 4 hours, 8 hours, etc.).

### 💻 User Interface
- **Auth Section:** Allows logging in or registering a new account.
- **Dashboard (User View):** 
  - You can view all registered IPs via a table with built-in pagination.
  - It provides a search field at the top.
  - There is a button to request downloading the public database in `.csv` format (via the `/api/public/ips` endpoint).
  - From the left panel, you can add new IP addresses by entering a valid IP and a comment.
- **Admin (Administrators Only):**
  - An extra tab will appear in the Dashboard for the 'admin' user.
  - It allows viewing a list of users, where it is possible to **Approve them**, **Promote to Admin**, **Reset Passwords**, or **Delete them**.

---

## 🛠️ Installation and Execution

The recommended way to deploy IP Manager is via **Docker**.

### With Docker Compose
Ensure you are in the project's root directory and run:

```bash
docker-compose up -d --build
```
The application will be running at: `http://localhost:3210/`

*Note:* `docker-compose.yml` will map a local `/db` volume to the container, so the databases persist on your machine even if the container is stopped or restarted.

### Local Node.js Execution
If you prefer not to use Docker:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```

The server uses the port defined in the `PORT` environment variable, or `3210` by default.

---

## 📋 Logging

Logging is handled by `utils/logger.js` and is **disabled by default**. It is controlled entirely via environment variables so it can be toggled without touching any code.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOG_ENABLED` | `false` | Set to `true` to enable logging. When `false`, no output is written anywhere. |
| `LOG_LEVEL` | `info` | Verbosity level: `error`, `info`, or `debug` (from least to most verbose). |

### Log Levels

| Level | What is logged |
|---|---|
| `error` | Only failed requests (HTTP status ≥ 400). Always written regardless of the configured level. |
| `info` | Successful requests (method, URL, status code, response time, client IP) **plus** all errors. |
| `debug` | Everything above **plus** the full request headers and body for every request. |

### Log Output

- **stdout** — every line is also printed to the console (visible in `docker logs`).
- **`db/requests.log`** — all lines are appended to this file on disk, persisted in the mapped Docker volume.

Log lines follow this format:
```
[2026-04-22T13:00:00.000Z] [INFO ] POST /api/login 200 12ms — ::1
```

### Sensitive Field Masking

In `debug` mode the request body is included in the log. The following fields are automatically masked as `***` before writing:

- `password`
- `newPassword`
- `token`
- `secret`

The body is also capped at **512 characters** to prevent log bloat.

### Example Docker Compose Configuration

```yaml
environment:
  LOG_ENABLED: "true"
  LOG_LEVEL: "info"   # use "debug" for full request tracing
```

---

## 🔌 API Endpoints

Below is the technical documentation for each endpoint available in the backend (`server.js`).

### Authentication (Public)

#### 1. `POST /api/register`
- **Description:** Registers a new user in the local database.
- **Body (JSON):** `{ "username": "...", "password": "..." }`
- **Responses:**
  - `201 Created`: User registered successfully (first user is Admin and Active; others are pending).
  - `400 Bad Request`: Missing data, or user already exists.

#### 2. `POST /api/login`
- **Description:** Logs in and returns a JWT token valid for 1 hour. Tracks IP/attempts for protection against brute-force attacks.
- **Body (JSON):** `{ "username": "...", "password": "..." }`
- **Responses:**
  - `200 OK`: Valid credentials; returns `{ "token": "...", "username": "...", "role": "..." }`.
  - `401 Unauthorized`: Invalid credentials.
  - `403 Forbidden`: Account is pending administrator approval.
  - `429 Too Many Requests`: IP is temporarily blocked due to consecutive failures.

---

### IPs Management (Protected)
*These endpoints require the JWT token in the HTTP header: `Authorization: Bearer <token>`.*

#### 3. `GET /api/ips`
- **Description:** Returns the complete list of IP addresses registered in the database.
- **Responses:**
  - `200 OK`: A JSON array containing the list of IPs.

#### 4. `POST /api/ips`
- **Description:** Adds a new IP address to the system. It validates the IP format and ensures no duplicates exist before inserting.
- **Body (JSON):** `{ "ip_address": "192.168... or CIDR", "comment": "..." }`
- **Responses:**
  - `201 Created`: IP added successfully.
  - `400 Bad Request`: Invalid IP format or missing `ip_address` field.
  - `409 Conflict`: The inserted IP address already exists in the file.

#### 5. `DELETE /api/ips/:id`
- **Description:** Deletes an IP address based on its assigned `id`.
- **URL Parameters:** `id` -> ID of the IP entry.
- **Responses:**
  - `200 OK`: IP record removed.
  - `404 Not Found`: No IP registered with the given ID was found.

---

### Data Download (Public)

#### 6. `GET /api/public/ips`
- **Description:** A public endpoint serving the direct raw download of the stored IPs file on the server. Requested in the frontend to export data as a `.csv`.
- **Responses:**
  - `200 OK`: Stream with the contents of `db/ips.txt`.
  - `404 Not Found`: Database not found on the server.

---

### Management and Administration (Admins Only)
*These endpoints require token authentication (`Authorization: Bearer <token>`) AND the associated token role must be `admin`.*

#### 7. `GET /api/admin/users`
- **Description:** Retrieves a safe list of all registered users in the system, showing only their ID, username, role, and status.
- **Responses:**
  - `200 OK`: Array of users in JSON format.

#### 8. `POST /api/admin/users/:id/approve`
- **Description:** Allows approving users so their status changes from `pending` to `active`, enabling them to log in.
- **URL Parameters:** `id` -> User ID.
- **Responses:**
  - `200 OK`: User approved.
  - `404 Not Found`: User does not exist.

#### 9. `POST /api/admin/users/:id/promote`
- **Description:** Changes an existing user's role from `user` to `admin`.
- **URL Parameters:** `id` -> User ID.
- **Responses:**
  - `200 OK`: User successfully promoted.
  - `404 Not Found`: User does not exist.

#### 10. `POST /api/admin/users/:id/reset-password`
- **Description:** Allows the Admin to reset and enforce a new password for a specific user.
- **URL Parameters:** `id` -> User ID.
- **Body (JSON):** `{ "newPassword": "..." }`
- **Responses:**
  - `200 OK`: Password updated.
  - `400 Bad Request`: Password not provided.
  - `404 Not Found`: User does not exist.

#### 11. `DELETE /api/admin/users/:id`
- **Description:** Permanently deletes a user from the system.
- **URL Parameters:** `id` -> User ID.
- **Responses:**
  - `200 OK`: User successfully deleted.
  - `400 Bad Request`: Protects the administrator from deleting themselves.
  - `404 Not Found`: User does not exist.
