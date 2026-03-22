const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

// Load environment variables from .env file
dotenv.config();

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;


//Middleware
app.use(cors());
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8'); // for deployment purpose we are converting the base64 string into json format

const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.v9x5iie.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const db = client.db('SafeShip')

        const parcelCollection = db.collection('parcels');
        const paymentCollection = db.collection('payments');
        const usersCollection = db.collection('users');
        const riderRequests = db.collection('riderReqs')


        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization //Getting the auth header from the req
            if (!authHeader) {
                return res.status(401).send({ message: 'Unauthorized access' }) // Show in browser when search the api
            }
            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            try {
                const decoded = await admin.auth().verifyIdToken(token); // Checking the token and saving it's owner info 
                req.decoded = decoded;
                next();
            }
            catch (error) {
                return res.status(403).send({ message: 'forbidden access' })
            }
        }


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email });
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'Admin access only' })
            }
            next();
        }

        // Create a new parcel
        app.post('/parcels', verifyFBToken, async (req, res) => {
            try {
                const parcelData = req.body; // getting parcel data from the client
                parcelData.createdAt = new Date();
                parcelData.userEmail = req.decoded.email;
                parcelData.paymentStatus = 'unpaid';
                parcelData.deliveryStatus = 'pending';
                parcelData.cost = 100;
                const result = await parcelCollection.insertOne(parcelData) // inserting parcel data in the database and saving the confirmation message here
                res.send(result); // sending the confirmation message to the client
            }
            catch (error) {
                res.status(500).send({ message: 'Failed to create' })
            }
        })

        // Create a new user
        app.post('/users', async (req, res) => {
            try {
                const email = req.body.email; // Getting the user email from the request
                const userExists = await usersCollection.findOne({ email })
                if (userExists) {
                    return res.status(200).send({ message: 'User already exists' })
                }
                const userInfo = req.body // Getting the user info from the request
                const result = await usersCollection.insertOne(userInfo); // Commanding to store the data in MongoDB and saving the confirmation here
                res.send(result); // Sending the confirmation message to the client
            }
            catch (error) {
                res.status(500).send({ message: 'Failed to post user data' })
            }
        })

        // Post rider data
        app.post('/riderReqs', verifyFBToken, async (req, res) => {
            try {
                const email = req.decoded.email; // Getting the email 
                const riderExist = await riderRequests.findOne({ email });
                if (riderExist) {
                    return res.status(409).send({ message: 'Rider request already submitted' });
                }
                const riderInfo = {
                    name: req.body.name,
                    phone: req.body.phone,
                    city: req.body.city,
                    vehicle: req.body.vehicle,
                    license: req.body.license || null,
                    experience: req.body.experience || '',
                    email,
                    status: 'pending',
                    createdAt: new Date()
                };
                const result = await riderRequests.insertOne(riderInfo);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to post rider data' });
            }
        });

        // Post payment data 
        app.post('/payments', verifyFBToken, async (req, res) => {
            try {
                const { parcelId, amount, paymentMethod, transactionId } = req.body; // getting payment data from the client
                const email = req.decoded.email
                // Update parcel payment status
                const updateResult = await parcelCollection.updateOne(
                    { _id: new ObjectId(parcelId), userEmail: email },
                    { $set: { paymentStatus: 'paid' } }
                ); // updating the doc matching with the parcelId 

                if (updateResult.modifiedCount === 0) {
                    return res.status(404).send({ message: 'Already paid' });
                }

                // insert payment record
                const paymentDoc = {
                    parcelId,
                    amount,
                    email,
                    paymentMethod,
                    transactionId,

                    createdAt: new Date()
                };
                const result = await paymentCollection.insertOne(paymentDoc); // inserting payment record in the database and saving the confirmation message here
                res.status(201).send({
                    success: true,
                    message: 'Payment recorded successfully',
                }); // Sending the confirmation message to the client
            }
            catch (error) {
                res.status(500).send({ message: 'Payment processing failed' });
            }
        })

        app.post('/create-payment-intent', async (req, res) => {
            const amountInCents = req.body.amount // getting amount from the client
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents, // amount in cents
                    currency: 'usd',
                    payment_method_types: ['card']
                })
                res.json({ clientSecret: paymentIntent.client_secret })
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        })

        // Get parcels by email
        app.get('/parcels', verifyFBToken, async (req, res) => {
            const email = req.decoded.email; // getting email from the url
            const query = { userEmail: email }; // creating query to find parcels by email. Query is like roll number of a student
            const options = {
                sort: { createdAt: -1 }
            }
            const result = await parcelCollection.find(query, options).toArray() // commanding the db to find data matching with the query and save here
            res.send(result) // sending the data to the client
        })

        // Get parcel by id
        app.get('/parcel/:id', verifyFBToken, async (req, res) => {
            try {
                const id = req.params.id; // getting id from the url
                const email = req.decoded.email // Getting the decoded email
                const query = { _id: new ObjectId(id), userEmail: email } // Converting the id and email into database form
                const result = await parcelCollection.findOne(query) // commanding the db to find the data matching with the query and save here
                res.send(result) // sending the data to the client
            }
            catch {
                res.status(500).send({ message: 'Failed to fetch parcel' });
            }
        })

        // Get payments by email
        app.get('/payments', verifyFBToken, async (req, res) => {
            const email = req.decoded.email; // getting email from the url
            const query = { email: email }; // creating query to find payments by email. Query is like roll number of a student 
            const result = await paymentCollection.find(query).toArray()// commanding the db to find data matching with the query and save here
            res.send(result) // sending the data to the client
        })

        // Get rider requests 
        app.get('/riderReqs', verifyFBToken, verifyAdmin, async (req, res) => {
            const query = { status: { $in: ['pending', 'hired'] } }
            const result = await riderRequests.find(query).toArray();
            res.send(result)
        })

        // Get only hired riders
        app.get('/hiredRiders', verifyFBToken, verifyAdmin, async (req, res) => {
            const query = { status: 'hired' }; // Query for the data which has pending or hired in status key
            const result = await riderRequests.find(query).toArray();// commanding to find the data matching with the query and save here
            res.send(result)
        })

        // Get user role by email
        app.get('/users/role', verifyFBToken, async (req, res) => {
            try {
                const email = req.decoded.email;

                if (!email) {
                    return res.status(400).send({ message: 'Email is required' })
                }

                const user = await usersCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' })
                }

                res.send({ role: user.role || 'user' })
            } catch (error) {
                res.status(500).send({ message: 'Failed to get role' })
            }
        })

        // Get pending parcel 
        app.get('/pendingParcels', verifyFBToken, verifyAdmin, async (req, res) => {
            const query = { deliveryStatus: 'pending' }; // Query for the data which has pending in deliveryStatus key
            const result = await parcelCollection.find(query).toArray(); // commanding to find the data matching with the query and save here
            res.send(result); // sending the data to the client
        })

        // Get inWarehouse parcel
        app.get('/inWarehouseParcels', verifyFBToken, async (req, res) => {
            const query = { deliveryStatus: 'inWarehouse' }; // Query for the data which has inWarehouse in deliveryStatus key
            const result = await parcelCollection.find(query).toArray(); // commanding to find the data matching with the query and save here
            res.send(result); // sending the data to the client
        })

        // Change the status into hired
        app.patch('/riders/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id; // getting the id from the route parameter
            const request = await riderRequests.findOne({
                _id: new ObjectId(id)
            });

            const query = { _id: new ObjectId(id), status: 'pending' }; // Making query to find the doc. Query works like  a roll number of a student
            const result = await riderRequests.updateOne(query, { $set: { status: 'hired' } }); // Commanding to update the doc matching with the query and save the confirmation message here

            if (result.modifiedCount > 0) {
                const userQuery = { email: request.email }; // which user to find
                const updateRole = await usersCollection.updateOne(userQuery,
                    { $set: { role: 'rider' } } // what to update
                )

                res.send({ success: true, message: 'Rider hired successfully' }); // sending the confirmation message to the client
            } else {
                res.status(404).send({ success: false, message: 'Could not hire rider or already hired' });
            }
        })

        // reject a request 
        app.patch('/rejectReq/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;// Getting the id from the route parameter

            const query = { _id: new ObjectId(id), status: { $in: ['pending', 'hired'] } } //Making query to find the doc. Query works like  a roll number of a student
            const request = await riderRequests.findOne(query);
            const result = await riderRequests.updateOne(query, {
                $set: { status: 'rejected' }
            })// Commanding to delete the doc matching with the query and save the confirmation message here

            if (result.modifiedCount > 0) {

                const userQuery = { email: request.email }; // which user to find
                const updateRole = await usersCollection.updateOne(userQuery,
                    { $set: { role: 'user' } } // what to update
                )
                res.send({ success: true, message: 'Rider rejected successfully' });
            } else {
                res.status(404).send({ success: false, message: 'Could not reject or rider hired' })
            }
        })

        // Update delivery status into dispatched
        app.patch('/dispatchParcel/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id; // Getting the id from the route parameter
            const query = { _id: new ObjectId(id), deliveryStatus: 'pending' }; //Making query to find the doc. Query works like  a roll number of a student
            const result = await parcelCollection.updateOne(query, {
                $set: { deliveryStatus: 'inWarehouse' }
            }) // Commanding to update the doc matching with the query and save the confirmation message here

            if (result.modifiedCount > 0) {
                res.send({ success: true, message: 'Parcel dispatched successfully' })

            }
            else {
                res.status(404).send({ success: false, message: 'Parcel not found or already dispatched' })
            }
        })

        // Delete a parcel
        app.delete('/delete/:id', async (req, res) => {
            const id = req.params.id; // Getting the parcel id from url
            const query = { _id: new ObjectId(id) } // Converging into mongodb id
            const result = await parcelCollection.deleteOne(query) // Commanding to delete the data matching with the query and saving the confirmation message here
            res.send(result) // sending the confirmation message to the client
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// Sample route
app.get('/', (req, res) => {
    res.send('Server is running');
})

// Start the server
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
})