const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const bodyParser = require('body-parser');
const connectEnsureLogin = require("connect-ensure-login");
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Set up middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Set up session
app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Change secure to true in production with HTTPS
}));

// Create a new SQLite database or open an existing one
const db = new sqlite3.Database('./sport_schedule', (err) => {
    if (err) {
        console.error('Could not connect to SQLite database:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Create users table if not exists
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('player', 'admin'))
    )
`);
// Create a table for storing events
db.run(`
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        date TEXT,
        venue TEXT,
        registrations TEXT
    );
`);

// Home route
app.get('/', (req, res) => {
    res.render('home');
});

// Render sign-up page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// POST route for sign-up
app.post('/signup', (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).send('Please provide all fields');
    }

    // Hash password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error hashing password');
        }

        // Insert new user into the database
        const query = 'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';
        db.run(query, [name, email, hashedPassword, role], function(err) {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Error registering user');
            }
            res.redirect('/login'); // Redirect to login after successful sign-up
        });
    });
});

// Render login page
app.get('/login', (req, res) => {
    res.render('login');
});

// POST route for login
app.post('/login', (req, res) => {
    const { email, password, role } = req.body;

    // Query the database to find user
    const query = 'SELECT * FROM users WHERE email = ? AND role = ?';
    db.get(query, [email, role], (err, user) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Error fetching user');
        }

        if (!user) {
            return res.status(400).send('Invalid credentials or role');
        }

        // Compare hashed password with the provided password
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error comparing passwords');
            }

            if (match) {
                // Store user session data
                req.session.userId = user.id;
                req.session.role = user.role;
                req.session.userName = user.name;

                if (user.role === 'player') {
                    res.redirect('/playerhome');  // Redirect to the player's home page
                } else if (user.role === 'admin') {
                    res.redirect('/adminhome'); // Redirect to the admin's home page
                }
            } else {
                return res.status(400).send('Invalid password');
            }
        });
    });
});

// Route to show the player's home page with upcoming events
app.get('/playerhome', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    db.all('SELECT * FROM events', (err, events) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error fetching events');
        }
        res.render('playerhome', { userName: req.session.userName, events });
    });
});

// Route to handle joining an event
// Route to handle joining an event
app.post('/join-event/:id', (req, res) => {
    const eventId = req.params.id;
    const playerId = req.session.userId; // Get the current logged-in player's ID

    // Check if the player is already registered for the event
    db.get('SELECT * FROM player_events WHERE player_id = ? AND event_id = ?', [playerId, eventId], (err, row) => {
        if (err) {
            return res.status(500).send('Error checking registration');
        }

        if (row) {
            return res.status(400).send('You have already joined this event');
        }

        // Add player to the event (insert into player_events table)
        const query = 'INSERT INTO player_events (player_id, event_id) VALUES (?, ?)';
        db.run(query, [playerId, eventId], (err) => {
            if (err) {
                return res.status(500).send('Error joining event');
            }

            res.json({ message: 'You have successfully joined the event!' });
        });
    });
});

  // Route to handle unjoining an event
  // Route to handle unjoining an event
app.post('/unjoin-event/:id', (req, res) => {
    const eventId = req.params.id;
    const playerId = req.session.userId; // Get the current logged-in player's ID

    // Check if the player is already registered for the event
    db.get('SELECT * FROM player_events WHERE player_id = ? AND event_id = ?', [playerId, eventId], (err, row) => {
        if (err) {
            return res.status(500).send('Error checking registration');
        }

        if (!row) {
            return res.status(400).send('You are not registered for this event');
        }

        // Remove player from the event (delete from player_events table)
        const query = 'DELETE FROM player_events WHERE player_id = ? AND event_id = ?';
        db.run(query, [playerId, eventId], (err) => {
            if (err) {
                return res.status(500).send('Error unjoining event');
            }

            res.json({ message: 'You have successfully unjoined the event!' });
        });
    });
});


// Route for admin (just as an example)
app.get('/adminhome', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.redirect('/login');
    }
    // Passing the userName to the EJS template
    res.render('adminhome', { userName: req.session.userName });
});

// Route to manage sports events
/*app.get('/manage-events', (req, res) => {
    db.all('SELECT * FROM events', (err, events) => {
        if (err) {
            console.error(err);
            return res.send("Error fetching events");
        }
        res.render('manage-events', { events }); // Render events list
    });
});*/
app.get('/manage-events', (req, res) => {
    console.log(req.session); // Check the session data
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    db.all('SELECT * FROM events', (err, events) => {
        if (err) {
            console.error(err);
            return res.send("Error fetching events");
        }
        res.render('manage-events', { events });
    });
});


// Route to add a new event (form view)
app.get('/add-event', (req, res) => {
    res.render('addevent'); // Add event form for admin
});

// Route to add event data into DB
/*
app.post('/addevent', (req, res) => {
    const { name, description, date, venue } = req.body;

    // Insert event into the database
    const query = `INSERT INTO events (name, description, date, venue, registrations) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [name, description, date, venue, JSON.stringify([])], (err) => {
        if (err) {
            console.log(err);
            return res.send("Error saving event");
        }
        res.redirect('/manage-events'); // Redirect to manage events after adding
    });
});
*/

// Route to show the form to create a new event
app.get('/create-event', (req, res) => {
    // Ensure that only admins can access this route
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.redirect('/login'); // Redirect to login if the user is not an admin
    }
    res.render('create-event'); // Render the 'create-event' page where the admin can fill in the event details
});

// Route to process the event creation
app.post('/create-event', (req, res) => {
    const { name, description, date, venue } = req.body;

    if (!name || !description || !date || !venue) {
        return res.status(400).send('Please provide all event fields');
    }

    // Insert the event into the database
    const query = `
        INSERT INTO events (name, description, date, venue, registrations) 
        VALUES (?, ?, ?, ?, ?)
    `;
    db.run(query, [name, description, date, venue, JSON.stringify([])], function(err) {
        if (err) {
            console.log(err);
            return res.status(500).send('Error saving event');
        }
        res.redirect('/manage-events'); // Redirect to the manage events page after event is created
    });
});



// Route to delete an event
app.post('/delete-event/:id', (req, res) => {
    const eventId = req.params.id;

    // Use your database to delete the event
    const query = `DELETE FROM events WHERE id = ?`;
    
    db.run(query, [eventId], function(err) {
        if (err) {
            console.log(err);
            return res.status(500).send("Error deleting event");
        }

        // Event successfully deleted
        res.redirect('/manage-events');  // Redirect to the events list page
    });
});

// Route to edit an event
app.post('/edit-event/:id', (req, res) => {
    const eventId = req.params.id;
    const { name, description, date, venue } = req.body;

    // Update the event in the database with new values
    const query = `UPDATE events SET name = ?, description = ?, date = ?, venue = ? WHERE id = ?`;
    db.run(query, [name, description, date, venue, eventId], (err) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error updating event");
        }

        // Respond with a success message, which will be used to refresh the page
        res.json({ success: true, message: 'Event updated successfully!' });
    });
});

// Route to view the admin's homepage with the option to manage sports
app.get('/admin', (req, res) => {
    res.render('admin'); // Render admin homepage with options
});

// Route to log out the user
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out');
        }
        res.redirect('/login');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
