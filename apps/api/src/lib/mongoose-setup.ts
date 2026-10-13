import mongoose from 'mongoose';

// Imported before any model is compiled.
// - bufferCommands=false: fail fast with DATABASE_UNAVAILABLE instead of hanging while disconnected.
// - autoCreate/autoIndex=false: collections and indexes are created explicitly after connecting
//   (see ensureIndexes), never implicitly at import time.
mongoose.set('bufferCommands', false);
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
mongoose.set('strictQuery', true);

export default mongoose;
