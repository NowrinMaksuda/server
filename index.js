// backend/server.js
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------- ADMIN CHECK MIDDLEWARE ----------------
// Simple header-based admin check (expects header 'role: admin')
// In production use proper auth & role check
const verifyAdmin = (req, res, next) => {
  const role = req.headers.role;
  if (role === 'admin') return next();
  return res
    .status(403)
    .json({ success: false, message: 'Access denied! Admin only.' });
};

// ---------------- MONGODB CONNECTION ----------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${
  process.env.DB_HOST || 'cluster0.2gqzmaz.mongodb.net'
}/?appName=${process.env.DB_APP_NAME || 'Cluster0'}`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'doctorPortal');

    const doctorCollection = db.collection('doctors');
    const userCollection = db.collection('users');
    const appointmentCollection = db.collection('appointments');

    console.log('✔ MongoDB Connected Successfully!');

    // ---------------- ROOT ----------------
    app.get('/', (req, res) => res.send('Doctor Portal Backend Running!'));

    // ---------------- USERS ----------------
    // Register user (POST /users) - sets default role 'user'
    app.post('/users', async (req, res) => {
      try {
        const userData = req.body;
        if (!userData?.email) {
          return res
            .status(400)
            .json({ success: false, message: 'Email required' });
        }
        userData.role = userData.role || 'user';
        const existingUser = await userCollection.findOne({
          email: userData.email,
        });
        if (existingUser) {
          return res
            .status(400)
            .json({ success: false, message: 'User already exists' });
        }
        const result = await userCollection.insertOne(userData);
        res.json({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get user by email (GET /users/:email)
    app.get('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        if (!user)
          return res
            .status(404)
            .json({ success: false, message: 'User not found' });
        res.json(user);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // ---------------- DOCTORS ----------------
    // Register doctor (pending) (POST /doctors)
    app.post('/doctors', async (req, res) => {
      try {
        const doctorData = req.body;
        if (!doctorData?.name)
          return res
            .status(400)
            .json({ success: false, message: 'Doctor name required' });
        doctorData.status = 'pending';
        const result = await doctorCollection.insertOne(doctorData);
        res.json({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Approved doctors (GET /doctors/approved)
    app.get('/doctors/approved', async (req, res) => {
      try {
        const doctors = await doctorCollection
          .find({ status: 'approved' })
          .toArray();
        res.json(doctors);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Pending doctors (admin only) (GET /doctors/pending)
    app.get('/doctors/pending', verifyAdmin, async (req, res) => {
      try {
        const doctors = await doctorCollection
          .find({ status: 'pending' })
          .toArray();
        res.json(doctors);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Approve doctor (admin only) (PATCH /doctors/:id/approve)
    app.patch('/doctors/:id/approve', verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await doctorCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'approved' } }
        );
        res.json({
          success: result.modifiedCount > 0,
          message:
            result.modifiedCount > 0
              ? 'Doctor approved successfully!'
              : 'No changes made',
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get single doctor by ID (GET /doctor/:id)
    app.get('/doctor/:id', async (req, res) => {
      try {
        const doctor = await doctorCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!doctor)
          return res
            .status(404)
            .json({ success: false, message: 'Doctor not found' });
        res.json(doctor);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // ---------------- APPOINTMENTS ----------------
    // Create appointment (POST /appointments)
    // Expected body: { userId, doctorId, doctorName, appointmentDate, ... }
    app.post('/appointments', async (req, res) => {
      try {
        const appointment = req.body;
        if (
          !appointment?.userId ||
          !appointment?.doctorId ||
          !appointment?.appointmentDate
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message: 'userId, doctorId and appointmentDate are required',
            });
        }

        // Save userId and doctorId as strings so frontend (string IDs) will match queries.
        const docToInsert = {
          ...appointment,
          userId: String(appointment.userId),
          doctorId: String(appointment.doctorId),
          status: appointment.status || 'pending',
          createdAt: new Date(),
        };

        const result = await appointmentCollection.insertOne(docToInsert);
        res.json({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get appointments by user ID (GET /appointments/user/:userId)
    app.get('/appointments/user/:userId', async (req, res) => {
      try {
        const userId = String(req.params.userId);
        const appointments = await appointmentCollection
          .find({ userId })
          .toArray();
        res.json(appointments);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get appointments by doctor ID (GET /appointments/doctor/:doctorId)
    app.get('/appointments/doctor/:doctorId', async (req, res) => {
      try {
        const doctorId = String(req.params.doctorId);
        const appointments = await appointmentCollection
          .find({ doctorId })
          .toArray();
        res.json(appointments);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Optional: list all appointments (admin)
    app.get('/appointments', verifyAdmin, async (req, res) => {
      try {
        const appointments = await appointmentCollection.find().toArray();
        res.json(appointments);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    console.log('Backend routes are ready!');
  } catch (err) {
    console.error('Failed to start backend:', err);
  }
}

run().catch(console.dir);

// Start server
app.listen(port, () => console.log(`Server running on port ${port}`));
