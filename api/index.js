// Vercel runs this as a serverless function for every /api request
// (see vercel.json). The site itself is served from the built dist/ folder.
import app from '../server/app.js';

export default app;
