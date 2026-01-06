const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion } = require('mongodb');

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

        app.post('/parcels', async(req,res)=> {
            try{
                const parcelData = req.body;
                parcelData.createdAt = new Date();

                const result = await parcelCollection.insertOne(parcelData)
                res.send(result);
            }
            catch(error) {
                res.status(500).send({message:'Failed to create'})
            }
        })

        app.get('/parcels', async(req,res)=> {
            try{
                const result = await parcelCollection.find().toArray();
                res.send(result) 
            }
            catch(error){
                res.status(500).send({message:'failed to fetch'})
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