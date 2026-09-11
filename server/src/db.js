import mongoose from 'mongoose';

function mongoUri() {
  let uri = String(process.env.MONGODB_URI || '').trim();
  if (uri.startsWith('MONGODB_URI=')) uri = uri.slice('MONGODB_URI='.length).trim();
  if (
    (uri.startsWith('"') && uri.endsWith('"')) ||
    (uri.startsWith("'") && uri.endsWith("'"))
  ) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
}

export async function connectDb() {
  const uri = mongoUri();
  if (!uri) throw new Error('MONGODB_URI is missing. Set it on the Render API service.');
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(
      'MONGODB_URI must start with mongodb+srv:// (no quotes). Example: mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/quiz'
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'quiz' });
  console.log('MongoDB: quiz database connected');
}
