const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Load environment variables from .env file
dotenv.config();

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;


//Middleware
app.use(cors());
app.use(express.json());



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
        await client.connect();

        const db = client.db('SafeShip')
        const parcelCollection = db.collection('parcels');
        const paymentCollection = db.collection('payments');

        app.post('/parcels', async (req, res) => {
            try {
                const parcelData = req.body; // getting parcel data from the client
                parcelData.createdAt = new Date();

                const result = await parcelCollection.insertOne(parcelData) // inserting parcel data in the database and saving the confirmation message here
                res.send(result); // sending the confirmation message to the client
            }
            catch (error) {
                res.status(500).send({ message: 'Failed to create' })
            }
        })

        // Get parcels by email
        app.get('/parcels/:email', async (req, res) => {
            const email = req.params.email; // getting email from the url
            const query = { userEmail: email }; // creating query to find parcels by email. Query is like roll number of a student
            const options = {
                sort: { createdAt: -1 }
            }
            const result = await parcelCollection.find(query, options).toArray() // commanding the db to find data matching with the query and save here
            res.send(result) // sending the data to the client
        })

        // Get parcel by id
        app.get('/parcel/:id', async (req, res) => {
            const id = req.params.id; // getting id from the url
            const query = { _id: new ObjectId(id) } // converting the id into mongodb id
            const result = await parcelCollection.findOne(query) // commanding the db to find the data matching with the query and save here
            res.send(result) // sending the data to the client
        })

        // Get payments by email
        app.get('/payments/:email', async (req, res) => {
            const email = req.params.email; // getting email from the url
            const query = { email: email }; // creating query to find payments by email. Query is like roll number of a student 
            const result = await paymentCollection.find(query).toArray()// commanding the db to find data matching with the query and save here
            res.send(result) // sending the data to the client
        })


        // Delete a parcel
        app.delete('/delete/:id', async (req, res) => {
            const id = req.params.id; // Getting the parcel id from url
            const query = { _id: new ObjectId(id) } // Converging into mongodb id
            const result = await parcelCollection.deleteOne(query) // Commanding to delete the data matching with the query and saving the confirmation message here
            res.send(result) // sending the confirmation message to the client
        })


        app.post('/payments', async (req, res) => {
            try {
                const { parcelId, email, amount, paymentMethod, transactionId } = req.body; // getting payment data from the client

                // Update parcel payment status
                const updateResult = await parcelCollection.updateOne(
                    { _id: new ObjectId(parcelId) },
                    { $set: { paymentStatus: 'paid' } }
                ); // updating the doc matching with the parcelId 

                if (updateResult.modifiedCount === 0) {
                    return res.status(404).send({ message: 'Already paid' });
                }

                // insert payment record
                const paymentDoc = {
                    parcelId,
                    email,
                    amount,
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



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
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