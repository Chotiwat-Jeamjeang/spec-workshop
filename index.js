require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const classifyRouter = require('./src/routes/classify');
const reportRouter = require('./src/routes/report');

if (!process.env.QR_SIGNING_SECRET) {
  throw new Error('QR_SIGNING_SECRET is not set — see .env.example');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit small limit: the JSON body this app accepts (location_id, sig,
// note) is at most a few hundred bytes; a default/unbounded limit would let
// an oversized body reach handler code before any validation runs.
app.use(express.json({ limit: '64kb' }));

app.use(classifyRouter);
app.use(reportRouter);

app.get('/', (req, res) => {
  res.send('smart-waste-reports API');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
