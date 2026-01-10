const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Load environment variables from .env file
dotenv.config();

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

        app.post('/parcels', async (req, res) => {
            try {
                const parcelData = req.body;
                parcelData.createdAt = new Date();

                const result = await parcelCollection.insertOne(parcelData)
                res.send(result);
            }
            catch (error) {
                res.status(500).send({ message: 'Failed to create' })
            }
        })

        // Get parcels by email
        app.get('/parcels/:email', async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email };
            const options = {
                sort: { createdAt: -1 }
            }
            const result = await parcelCollection.find(query, options).toArray()
            res.send(result)
        })

        app.get('/parcel/:id', async(req,res)=> {
            const id = req.params.id; // getting id from the url
            const query = {_id: new ObjectId(id)} // converting the id into mongodb id
            const result = await parcelCollection.findOne(query) // commanding the db to find the data matching with the query and save here
            res.send(result) // sending the data to the client
        })

        // Delete a parcel
        app.delete('/delete/:id', async (req, res) => {
            const id = req.params.id; // Getting the parcel id from url
            const query = { _id: new ObjectId(id) } // Converging into mongodb id
            const result = await parcelCollection.deleteOne(query) // Commanding to delete the data matching with the query and saving the confirmation message here
            res.send(result) // sending the confirmation message to the client
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