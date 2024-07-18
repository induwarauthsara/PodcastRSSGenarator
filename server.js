const express = require('express');
const multer = require('multer');
const xmlbuilder = require('xmlbuilder');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const { parseStringPromise, Builder } = require('xml2js');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'audioFile') {
            cb(null, 'uploads/audio');
        } else if (file.fieldname === 'episodeImage') {
            cb(null, 'uploads/images');
        }
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Middleware to check if the user is logged in
function checkAuth(req, res, next) {
    if (req.session.user && req.session.user === "admin") {
        next();
    } else {
        res.redirect('/login');
    }
}

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/login', (req, res) => {
    res.send(`
        <form method="POST" action="/login">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" required><br><br>
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required><br><br>
            <button type="submit">Login</button>
        </form>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'password') {
        req.session.user = 'admin';
        res.redirect('/upload');
    } else {
        res.send('Invalid credentials');
    }
});

app.get('/upload', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/upload.html'));
});

app.post('/upload', checkAuth, upload.fields([
    { name: 'audioFile', maxCount: 1 },
    { name: 'episodeImage', maxCount: 1 }
]), async(req, res) => {
    const { episodeName, episodeNumber } = req.body;
    const audioFile = req.files['audioFile'][0];
    const episodeImage = req.files['episodeImage'][0];

    const newEpisode = {
        title: episodeName,
        itunes_episode: episodeNumber,
        enclosure: { _attr: { url: `/uploads/audio/${audioFile.filename}`, type: 'audio/mpeg' } },
        itunes_image: { _attr: { href: `/uploads/images/${episodeImage.filename}` } },
        pubDate: new Date().toISOString()
    };

    try {
        const rssData = fs.readFileSync('rssFeed.xml', 'utf-8');
        const rssJson = await parseStringPromise(rssData);

        // Ensure rssJson.rss.channel[0].item exists
        if (!rssJson.rss.channel[0].item) {
            rssJson.rss.channel[0].item = [];
        }

        rssJson.rss.channel[0].item.unshift(newEpisode);

        const builder = new Builder();
        const updatedRssData = builder.buildObject(rssJson);

        fs.writeFileSync('rssFeed.xml', updatedRssData);

        res.status(200).send('Episode uploaded and RSS feed updated.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to update RSS feed.');
    }
});

// Serve home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// API to get episodes
app.get('/api/episodes', async(req, res) => {
    try {
        const rssData = fs.readFileSync('rssFeed.xml', 'utf-8');
        const rssJson = await parseStringPromise(rssData);
        const episodes = rssJson.rss.channel[0].item || [];
        res.json({ episodes });
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to load episodes.');
    }
});

app.get('/feed/podcast', (req, res) => {
    res.sendFile(path.join(__dirname, 'rssFeed.xml'));
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});