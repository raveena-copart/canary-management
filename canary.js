const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

const app = express();
const port = 3000;

app.use(bodyParser.json());

const internalServiceUrl = 'http://localhost:5000';

// --- Proxy for /canaryPerformanceFromPi ---
app.post('/canaryPerformanceFromPi', async (req, res) => {
    const data = req.body;
    const macAddress = data?.mac_address; // Extract MAC address for logging
    console.log(`Received performance data from Pi (MAC: ${macAddress}):`, data);

    try {
        const response = await axios.post(`${internalServiceUrl}/canaryPerformanceFromPi`, data);
        console.log(`Forwarded performance data to internal service (MAC: ${macAddress}):`, response.data);
        res.status(response.status).send(response.data);
    } catch (error) {
        console.error(`Error forwarding performance data (MAC: ${macAddress}):`, error.message, error.response?.status, error.response?.data);
        res.status(500).send(`Error processing performance data: ${error.message}`);
    }
});

// --- Proxy for /canaryConfig ---
app.get('/canaryConfig', async (req, res) => {
    const macAddress = req.query.mac_address;
    console.log(`Received canaryConfig request from Pi (MAC: ${macAddress})`);

    if (!macAddress) {
        console.warn("Missing MAC address in canaryConfig request.");
        return res.status(400).send("MAC address is required");
    }

    try {
        const response = await axios.get(`${internalServiceUrl}/canaryConfig?mac_address=${macAddress}`);
        console.log(`Forwarded canaryConfig request to internal service (MAC: ${macAddress}):`, response.data);
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error(`Error forwarding canaryConfig request (MAC: ${macAddress}):`, error.message, error.response?.status, error.response?.data);
        res.status(500).send(`Error fetching device configuration: ${error.message}`);
    }
});

// --- Proxy for /canaryConfig/resetFlag ---
app.post('/canaryConfig/resetFlag', async (req, res) => {
    const { mac_address, update_script } = req.body;
    console.log(`Received resetFlag request from Pi (MAC: ${mac_address}, update_script: ${update_script})`);

    if (!mac_address) {
        console.warn("Missing MAC address in resetFlag request.");
        return res.status(400).send("MAC address is required");
    }

    try {
        const response = await axios.post(`${internalServiceUrl}/canaryConfig/resetFlag`, { mac_address, update_script });
        console.log(`Forwarded resetFlag request to internal service (MAC: ${mac_address}):`, response.data);
        res.status(response.status).send(response.data);
    } catch (error) {
        console.error(`Error forwarding resetFlag request (MAC: ${mac_address}):`, error.message, error.response?.status, error.response?.data);
        res.status(500).send(`Error resetting update_script: ${error.message}`);
    }
});

// --- Serving /getCanaryScript (Static File) ---
app.get('/getCanaryScript', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'RaspberryCode.zip');
    console.log("Serving update script from:", filePath);

    res.download(filePath, (err) => {
        if (err) {
            console.error("Error sending update script:", err);
            res.status(500).send(`Error sending update script: ${err.message}`);
        } else {
            console.log("Update script sent successfully.");
        }
    });
});

app.listen(port, () => {
    console.log(`Public-facing service listening on port ${port}`);
});