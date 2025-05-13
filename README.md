# Canary Management

## Project Setup

1. Install dependencies:
    ```bash
    npm install
    cd client
    npm install
    ```

2. Create a `.env` file in the root directory and add your MongoDB connection string:
    ```env
    MONGO_URI=your_mongodb_connection_string
    PORT=5000
    ```

3. Run the development server:
    ```bash
    npm run dev
    ```

## Project Structure

- `client`: Contains the React application.
- `server`: Contains the server-side code.
- `server.js`: Entry point for the Node.js server.
