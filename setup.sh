#!/bin/bash

# Create directories
mkdir -p client/public client/src/components client/src/styles server/middleware server/routes server/controllers server/models server/config

# Create files with content

# client/public/index.html
cat <<EOL > client/public/index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Canary Management</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>
EOL

# client/src/components/App.js
cat <<EOL > client/src/components/App.js
import React from 'react';

function App() {
    return (
        <div className="App">
            <h1>Welcome to Canary Management</h1>
        </div>
    );
}

export default App;
EOL

# client/src/index.js
cat <<EOL > client/src/index.js
import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import './styles/App.css';

ReactDOM.render(<App />, document.getElementById('root'));
EOL

# client/src/styles/App.css
cat <<EOL > client/src/styles/App.css
.App {
    text-align: center;
}
EOL

# server/middleware/auth.js
cat <<EOL > server/middleware/auth.js
function auth(req, res, next) {
    // Authentication middleware logic
    next();
}

module.exports = auth;
EOL

# server/routes/api.js
cat <<EOL > server/routes/api.js
const express = require('express');
const router = express.Router();
const exampleController = require('../controllers/exampleController');

router.get('/example', exampleController.getExample);

module.exports = router;
EOL

# server/controllers/exampleController.js
cat <<EOL > server/controllers/exampleController.js
exports.getExample = (req, res) => {
    res.send('Example response');
};
EOL

# server/models/exampleModel.js
cat <<EOL > server/models/exampleModel.js
// Example model
const exampleModel = {
    data: 'example data'
};

module.exports = exampleModel;
EOL

# server/config/db.js
cat <<EOL > server/config/db.js
// Database configuration
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
EOL

# server.js
cat <<EOL > server.js
const express = require('express');
const connectDB = require('./server/config/db');
const apiRoutes = require('./server/routes/api');

const app = express();

// Connect to database
connectDB();

// Middleware
app.use(express.json());
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
EOL

# package.json
cat <<EOL > package.json
{
  "name": "canary-management",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "client": "cd client && npm start",
    "server": "nodemon server.js",
    "dev": "concurrently \\"npm run server\\" \\"npm run client\\""
  },
  "dependencies": {
    "express": "^4.17.1",
    "mongoose": "^5.12.3"
  },
  "devDependencies": {
    "concurrently": "^6.0.0",
    "nodemon": "^2.0.7"
  }
}
EOL

# .env
cat <<EOL > .env
MONGO_URI=your_mongodb_connection_string
PORT=5000
EOL

# README.md
cat <<EOL > README.md
# Canary Management

## Project Setup

1. Install dependencies:
    \`\`\`bash
    npm install
    cd client
    npm install
    \`\`\`

2. Create a \`.env\` file in the root directory and add your MongoDB connection string:
    \`\`\`env
    MONGO_URI=your_mongodb_connection_string
    PORT=5000
    \`\`\`

3. Run the development server:
    \`\`\`bash
    npm run dev
    \`\`\`

## Project Structure

- \`client\`: Contains the React application.
- \`server\`: Contains the server-side code.
- \`server.js\`: Entry point for the Node.js server.
EOL

echo "Project structure created successfully."