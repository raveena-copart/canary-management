const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const { sequelize, connectDB } = require('./server/config/db/db'); // Import Sequelize instance and connectDB function

const app = express();
const port = process.env.APP_PORT || 5000;
const dbName = process.env.DB_NAME || 'canary';

app.use(bodyParser.json());
const corsOptions = {
    origin: 'http://localhost:3000', // Replace with your React app's origin
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow cookies
    optionsSuccessStatus: 204, // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Connect to database
console.log('Attempting to connect to the database...');
connectDB()
    .then(() => {
        console.log('Database connection successful.');
    })
    .catch((error) => {
        console.error('Database connection failed:', error);
    });

const canary = 'canary';
const deviceRegistrationTable = 'canary_device_registration';


// Insert performance data into the main table
const insertPerformanceData = async (data) => {
    try {
        const query = `
            INSERT INTO ${dbName}.canary (
              timestamp,
              deviceName,
              url,
              http_status,
              load_time,
              content_length,
              download_speed_mbps,
              upload_speed_mbps,
              ping_ms,
              error_message,
              traceroute_hops,
              mac_address
            )
            VALUES (
              ?,
              (SELECT device_name
                 FROM ${dbName}.canary_device_registration
                 WHERE mac_address = ?
                 LIMIT 1),
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `;

        const values = [
            data.timestamp,
            data.mac_address,
            data.website_performance.url,
            data.website_performance.http_status,
            data.website_performance.load_time,
            data.website_performance.content_length,
            data.network_performance.download_speed_mbps,
            data.network_performance.upload_speed_mbps,
            data.network_performance.ping_ms,
            data.website_performance.error_message || null,
            data.trace_route || null,
            data.mac_address// Add traceroute hops as text
        ];

        await sequelize.query(query, {
            replacements: values,
            type: sequelize.QueryTypes.INSERT
        });
        console.log('Data inserted successfully');
    } catch (error) {
        console.error('Error inserting data:', error);
    }
};

// Endpoint to receive performance data
app.post('/api/canaryPerformanceFromPi', async (req, res) => {
    const data = req.body;
    console.log('Received data:', data);

    try {
        // 1) Validate that this MAC + authenticator_key is registered
        const query = `
          SELECT device_name
          FROM ${dbName}.canary_device_registration
          WHERE mac_address = :mac
            AND authenticator_key = :authKey
          LIMIT 1
        `;
        
        const [results] = await sequelize.query(query, {
            replacements: {
                mac: data.mac_address,
                authKey: data.authenticator_key
            },
            type: sequelize.QueryTypes.SELECT
        });
        
        if (!results) {
            // If no row returned, the combination is invalid
            return res.status(401).json({
                error: 'Invalid mac_address or authenticator_key'
            });
        }

        // 2) If we get here, the key is valid. Let's insert
        await insertPerformanceData(data);

        // 3) Return success
        res.status(200).send('Data received');

    } catch (error) {
        console.error('Error in endpoint:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});


app.get('/api/canaryConfig', async (req, res) => {
    // Get the MAC address from the query parameters
    const mac_address = req.query.mac_address;
    console.log('Received MAC address:', mac_address);
  
    if (!mac_address) {
      return res
        .status(400)
        .send({ message: 'MAC address is required in the query string' });
    }
  
    try {
      // Using QueryTypes.SELECT returns an array of row objects
      const results = await sequelize.query(
        `
          SELECT destination, interval_minutes, authenticator_key
          FROM ${dbName}.canary_device_registration
          WHERE mac_address = ?
        `,
        {
          replacements: [mac_address],
          type: sequelize.QueryTypes.SELECT,
        }
      );
  
      // Log what actually comes back
      console.log('Query results:', results);
  
      // If no rows were returned, handle it
      if (!results || results.length === 0) {
        console.log('Device not found for MAC address:', mac_address);
        return res
          .status(404)
          .send({ message: 'Device not found for the given MAC address' });
      }
  
      // results is an array; the first row object is your deviceConfig
      const deviceConfig = results[0];
  
      // Safely handle the destination field (ensure it's a valid JSON array)
      let destinations = [];
      try {
        if (deviceConfig.destination) {
          destinations = Array.isArray(deviceConfig.destination)
            ? deviceConfig.destination
            : JSON.parse(deviceConfig.destination);
        }
      } catch (err) {
        console.error('Error parsing destination:', err);
        // Default to empty array if parsing fails
        destinations = [];
      }
  
      // Build the config data to return
      const configData = {
        destinations,
        interval_minutes: deviceConfig.interval_minutes || 5,
        authenticator_key: deviceConfig.authenticator_key || null,
      };
  
      // Return the config data as JSON
      return res.json(configData);
    } catch (error) {
      console.error('Error fetching device configuration:', error);
      return res.status(500).send('Error fetching device configuration');
    }
  });
  

  app.post('/api/registerCanary', async (req, res) => {
    const { device_name, mac_address, destination, interval_minutes } = req.body;
    console.log('Received device registration:', { device_name, mac_address });

    // 1) Validate fields: device_name & mac_address must exist and not be empty
    if (!device_name || !mac_address) {
        return res.status(400).send({
            message: 'Both device_name and mac_address are required.'
        });
    }

    try {
        // 2) Check if the MAC address is already registered
        const checkQuery = `
            SELECT * FROM ${dbName}.canary_device_registration
            WHERE mac_address = ?
        `;
        const [checkResults] = await sequelize.query(checkQuery, {
            replacements: [mac_address],
            type: sequelize.QueryTypes.SELECT
        });

        if (Array.isArray(checkResults) && checkResults.length > 0) {
            // MAC address already exists
            return res.status(400).send({
                message: 'MAC address already registered.'
            });
        } else {
            // 3) Insert the new device record, setting approval_status to 'pending'
            const insertQuery = `
                INSERT INTO ${dbName}.canary_device_registration
                (device_name, mac_address, destination, interval_minutes, approval_status)
                VALUES (?, ?, ?, ?, 'pending')
            `;
            const values = [
                device_name,
                mac_address,
                destination || null,
                interval_minutes || null
            ];

            const [insertResult] = await sequelize.query(insertQuery, {
                replacements: values,
                type: sequelize.QueryTypes.INSERT
            });

            return res.status(200).send({
                message: 'Device registered successfully',
                id: insertResult.insertId
            });
        }
    } catch (error) {
        console.error('Error registering device:', error);
        return res.status(500).send('Error registering device');
    }
});


app.post('/api/canaryConfig/resetFlag', async (req, res) => {
    const { mac_address, update_script } = req.body;
    // update_script is expected to be 0 if the update succeeded

    if (!mac_address) {
        return res.status(400).send('mac_address is required');
    }

    try {
        // Suppose your table is canary_device_registration
        const updateQuery = `
            UPDATE canary_device_registration
            SET update_script = ?
            WHERE mac_address = ?
        `;

        await sequelize.query(updateQuery, {
            replacements: [update_script, mac_address],
            type: sequelize.QueryTypes.UPDATE
        });

        return res.status(200).send('update_script reset successfully');
    } catch (error) {
        console.error('Error resetting update_script:', error);
        return res.status(500).send('Error resetting update_script');
    }
});

// Assuming you have something like:
// const express = require('express');
// const sequelize = require('./path/to/your/sequelize/instance');
// const dbName = 'yourDatabaseName'; // The actual name of your DB or schema

app.get('/api/canaryPerformance/latestPerDevice', async (req, res) => {
    console.log('Fetching latest record per device...');
  
    try {
      // Query: for each MAC address, get the row with the MAX timestamp.
      const query = `
      SELECT 
        c.id,
        c.deviceName,
        c.mac_address,
        c.url,
        c.http_status,
        c.load_time,
        c.content_length,
        c.download_speed_mbps,
        c.upload_speed_mbps,
        c.ping_ms,
        c.traceroute_hops,
        -- Convert DATETIME to plain "YYYY-MM-DD HH:mm:ss"
        DATE_FORMAT(c.timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp
      FROM ${dbName}.canary AS c
      INNER JOIN (
        SELECT mac_address, MAX(timestamp) AS max_timestamp
        FROM ${dbName}.canary
        GROUP BY mac_address
      ) AS latest
        ON c.mac_address = latest.mac_address
       AND c.timestamp   = latest.max_timestamp
      ORDER BY c.timestamp DESC
    `;
  
      // Execute raw query via Sequelize; returns [rows, metadata].
      const results = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT,
      });
      console.log('Query results:', results); // ADDED CONSOLE LOG
      // Return the entire array of rows (one per MAC) as JSON
      res.json(results);
    } catch (error) {
      console.error('Error fetching latest records per device:', error);
      return res.status(500).send('Error fetching data');
    }
  });
  
  

app.get('/api/canaryPerformance/allByMac/:mac', async (req, res) => {
    const { mac } = req.params;
    console.log('Fetching all records for MAC:', mac); // ADDED CONSOLE LOG
    try {
        const query = `
        SELECT 
          id,
          deviceName,
          mac_address,
          url,
          http_status,
          load_time,
          content_length,
          download_speed_mbps,
          upload_speed_mbps,
          ping_ms,
          traceroute_hops,
          -- Convert DATETIME to plain "YYYY-MM-DD HH:mm:ss"
          DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp
        FROM ${dbName}.canary
        WHERE mac_address = ?
        ORDER BY timestamp DESC
      `;
        const results = await sequelize.query(query, {
            replacements: [mac],
            type: sequelize.QueryTypes.SELECT
        });
        console.log('Query results:', results); // ADDED CONSOLE LOG
        res.json(results);
    } catch (error) {
        console.error('Error fetching all records by MAC:', error);
        return res.status(500).send('Error fetching data');
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // We'll store it in a folder named "canary-update" under "public"
        cb(null, path.join(__dirname, 'public', 'canary-update'));
    },
    filename: function (req, file, cb) {
        // Example: keep the original name, or do Date.now() + '_' + file.originalname
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

app.get('/api/canaryRegister', async (req, res) => {
    try {
        console.log('I get the request')
        const query = `SELECT * FROM ${dbName}.canary_device_registration`;
        const results = await sequelize.query(query, {
            type: sequelize.QueryTypes.SELECT
        });
        // Log the raw data being sent to the frontend
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching registered devices:', error);
        res.status(500).send('Error fetching registered devices');
    }
});

// Update registered device details
app.put('/api/canaryRegister/:id', async (req, res) => {
    const deviceId = req.params.id;
    const {
        device_name,
        mac_address,
        destination,
        interval_minutes,
        update_script
    } = req.body;

    try {
        const updateQuery = `
            UPDATE ${dbName}.canary_device_registration
            SET device_name = ?,
                mac_address = ?,
                destination = ?,
                interval_minutes = ?,
                update_script = ?
            WHERE id = ?
        `;

        await sequelize.query(updateQuery, {
            replacements: [
                device_name,
                mac_address,
                JSON.stringify(destination),
                interval_minutes,
                // if update_script is boolean, do update_script ? 1 : 0
                update_script ? 1 : 0,
                deviceId
            ],
            type: sequelize.QueryTypes.UPDATE
        });

        res.status(200).send({ message: 'Device updated successfully' });
    } catch (error) {
        console.error('Error updating device:', error);
        return res.status(500).send('Error updating device');
    }
});

app.put('/api/canaryRegister/approve/:id', async (req, res) => {
    const deviceId = req.params.id;
    try {
        // Generate a new auth key
        const auth_key = crypto.randomBytes(16).toString('hex');

        const updateQuery = `
            UPDATE ${dbName}.canary_device_registration
            SET approval_status = 'approved', authenticator_key = ?
            WHERE id = ?
        `;
        await sequelize.query(updateQuery, {
            replacements: [auth_key, deviceId],
            type: sequelize.QueryTypes.UPDATE
        });

        res.status(200).json({ message: 'Device approved', auth_key });
    } catch (error) {
        console.error('Error approving device:', error);
        return res.status(500).send('Error approving device');
    }
});

app.delete('/api/canaryRegister/:id', async (req, res) => {
    const deviceId = req.params.id;
    try {
        const deleteQuery = `DELETE FROM ${dbName}.canary_device_registration WHERE id = ?`;
        await sequelize.query(deleteQuery, {
            replacements: [deviceId],
            type: sequelize.QueryTypes.DELETE
        });
        res.status(200).json({ message: 'Device deleted successfully' });
    } catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).send('Error deleting device');
    }
});


// 3) NEW ROUTE: POST /canaryRegister/upload/:id for file uploads
app.post('/api/canaryRegister/uploadByMac', async (req, res) => {
    // We'll rely on req.body.mac_address instead of req.params.id
    const {
        device_name,
        mac_address,
        destination,
        interval_minutes,
        zipBinary,
        zipName
    } = req.body;

    // If we have zipBinary, set update_script=1; else 0
    const updateScriptVal = zipBinary ? 1 : 0;

    // 1) Update the DB by mac_address
    try {
        const updateQuery = `
          UPDATE ${dbName}.canary_device_registration
          SET device_name = ?,
              mac_address = ?,
              destination = ?,
              interval_minutes = ?,
              update_script = ?
          WHERE mac_address = ?
        `;

        await sequelize.query(
            updateQuery,
            {
                replacements: [
                    device_name,
                    mac_address,
                    JSON.stringify(destination),
                    interval_minutes,
                    updateScriptVal, // 1 if zipBinary is present, else 0
                    mac_address       // the WHERE condition
                ],
                type: sequelize.QueryTypes.UPDATE
            }
        );

        // 2) If there's a zipBinary, decode and save it
        if (zipBinary) {
            const buffer = Buffer.from(zipBinary, 'binary');
            const finalName = zipName || `script_${Date.now()}.zip`;
            const filePath = path.join(__dirname, 'public', 'canary-update', finalName);

            fs.writeFile(filePath, buffer, (err2) => {
                if (err2) {
                    console.error('Error saving .zip file:', err2);
                    return res.status(500).json({ error: 'Error saving file' });
                }
                console.log('.zip file saved to:', filePath);

                return res.status(200).send({
                    message: 'Device updated + zip file saved',
                    filePath: filePath
                });
            });
        } else {
            // No file => update_script=0
            return res.status(200).send({
                message: 'Device updated (no zip file)'
            });
        }
    } catch (error) {
        console.error('Error updating device + uploading file:', error);
        return res.status(500).send('Error updating device + uploading file');
    }
});

app.use(express.static(path.join(__dirname, 'client', 'build')));

// Optional:  For single-page applications, serve the index.html file for all routes (DEVELOPMENT ONLY)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});