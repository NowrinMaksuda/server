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
    const medicineCollection = db.collection('medicines'); // 🧪 new
    const orderCollection = db.collection('orders'); // 🧾 new

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
          return res.status(400).json({
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

    // ---------------- MEDICINES ----------------

    // Add new medicine (admin only) (POST /medicines)
    app.post('/medicines', verifyAdmin, async (req, res) => {
      try {
        const { name, category, price, stock, description, image } = req.body;

        if (!name || price === undefined || price === '') {
          return res.status(400).json({
            success: false,
            message: 'name and price are required',
          });
        }

        const doc = {
          name,
          category: category || '',
          price: Number(price),
          stock: stock !== undefined && stock !== '' ? Number(stock) : 0,
          description: description || '',
          image: image || '',
          createdAt: new Date(),
        };

        const result = await medicineCollection.insertOne(doc);
        res.json({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get all medicines (GET /medicines)
    app.get('/medicines', async (req, res) => {
      try {
        const medicines = await medicineCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(medicines);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Search medicines (GET /medicines/search?search=...)
    app.get('/medicines/search', async (req, res) => {
      try {
        const search = (req.query.search || '').trim();

        const filter = search
          ? {
              $or: [
                { name: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
              ],
            }
          : {};

        const medicines = await medicineCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();

        res.json(medicines);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get single medicine by ID (GET /medicines/:id)
    app.get('/medicines/:id', async (req, res) => {
      try {
        let id;
        try {
          id = new ObjectId(req.params.id);
        } catch {
          return res
            .status(400)
            .json({ success: false, message: 'Invalid medicine id' });
        }

        const medicine = await medicineCollection.findOne({ _id: id });
        if (!medicine) {
          return res
            .status(404)
            .json({ success: false, message: 'Medicine not found' });
        }
        res.json(medicine);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // ---------------- ORDERS ----------------

    // Create order (POST /orders)
    // Expected body: { userId, medicineId, quantity }
    app.post('/orders', async (req, res) => {
      try {
        const { userId, medicineId, quantity } = req.body;

        if (!userId || !medicineId || quantity === undefined) {
          return res.status(400).json({
            success: false,
            message: 'userId, medicineId and quantity are required',
          });
        }

        const qty = Number(quantity);
        if (isNaN(qty) || qty <= 0) {
          return res.status(400).json({
            success: false,
            message: 'quantity must be a positive number',
          });
        }

        let medicineObjectId;
        try {
          medicineObjectId = new ObjectId(medicineId);
        } catch {
          return res
            .status(400)
            .json({ success: false, message: 'Invalid medicineId' });
        }

        // Decrease stock atomically only if enough stock is available
        const updateResult = await medicineCollection.updateOne(
          { _id: medicineObjectId, stock: { $gte: qty } },
          { $inc: { stock: -qty } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(400).json({
            success: false,
            message: 'Medicine not found or insufficient stock',
          });
        }

        // Get latest medicine info for price
        const medicine = await medicineCollection.findOne({
          _id: medicineObjectId,
        });

        const orderDoc = {
          userId: String(userId),
          medicineId: String(medicineId),
          quantity: qty,
          pricePerUnit: medicine?.price ?? null,
          totalPrice:
            medicine && typeof medicine.price === 'number'
              ? medicine.price * qty
              : null,
          status: 'placed',
          createdAt: new Date(),
        };

        const result = await orderCollection.insertOne(orderDoc);
        res.json({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get orders by user ID (GET /orders/user/:userId)
    app.get('/orders/user/:userId', async (req, res) => {
      try {
        const userId = String(req.params.userId);
        const orders = await orderCollection
          .find({ userId })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(orders);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get all orders (admin only) (GET /orders)
    app.get('/orders', verifyAdmin, async (req, res) => {
      try {
        const orders = await orderCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(orders);
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
