const client = require("../config/db");
const { ObjectId } = require("mongodb");
const crypto = require("crypto");

const ordersCollection = client.db("Arabian-Essense").collection("Orders");

// CREATE ORDER
exports.createOrder = async (req, res) => {
  const orderId =
    "ORD-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");

  const order = {
    ...req.body,
    email: req.decoded.email, 
    orderId,
    status: [{ step: "pending", date: new Date() }],
    createdAt: new Date(),
  };

  const result = await ordersCollection.insertOne(order);
  res.send({ success: true, orderId, insertedId: result.insertedId });
};

// GET USER ORDERS (JWT থেকে email নেওয়া)
exports.getUserOrders = async (req, res) => {
  try {
    const userEmail = req.decoded.email;
   
    const orders = await ordersCollection
      .find({ email: userEmail })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(orders);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server Error" });
  }
};

// OTHER ADMIN FUNCTIONS (unchanged)
exports.getRecentOrders = async (req, res) => {
  try {
    const search = req.query.search || "";

    const query = search
      ? { email: { $regex: search, $options: "i" } }
      : {};

    const result = await ordersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server Error" });
  }
};


exports.getPendingOrders = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = req.query.search || "";

  const query = {
    email: { $regex: search, $options: "i" },
    $expr: { $eq: [{ $arrayElemAt: ["$status.step", -1] }, "pending"] },
  };

  const orders = await ordersCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  const total = await ordersCollection.countDocuments(query);

  res.send({
    orders,
    totalPages: Math.ceil(total / limit),
  });
};

exports.confirmOrder = async (req, res) => {
  const result = await ordersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $push: { status: { step: "confirmed", date: new Date() } } }
  );
  res.send(result);
};

exports.getConfirmedOrders = async (req, res) => {
  const result = await ordersCollection
    .find({ "status.step": "confirmed" })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
};

exports.updateOrderStatus = async (req, res) => {
  const result = await ordersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $push: { status: { step: req.body.step, date: new Date() } } }
  );
  res.send(result);
};

exports.getSingleOrder = async (req, res) => {
  const result = await ordersCollection.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
};

exports.cancelOrder = async (req, res) => {
  const result = await ordersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $push: { status: { step: "cancelled", date: new Date() } } }
  );
  res.send({ success: true, result });
};

exports.deleteOrder = async (req, res) => {
  const result = await ordersCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send({ success: true, deletedCount: result.deletedCount });
};
