const client = require("../config/db");
const { ObjectId } = require("mongodb");

const productsCollection = client
  .db("Arabian-Essense")
  .collection("Products");

exports.getAllProducts = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const totalProducts = await productsCollection.countDocuments();

  const products = await productsCollection
    .find()
    .skip(skip)
    .limit(limit)
    .toArray();

  res.send({
    products,
    totalProducts,
    totalPages: Math.ceil(totalProducts / limit),
  });
};

exports.getSingleProduct = async (req, res) => {
  const product = await productsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(product);
};

exports.addProduct = async (req, res) => {
  const result = await productsCollection.insertOne(req.body);
  res.send(result);
};

exports.deleteProduct = async (req, res) => {
  const result = await productsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
};
