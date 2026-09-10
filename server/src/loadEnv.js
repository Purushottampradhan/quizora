import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dir, '../../.env') });
dotenv.config({ path: path.resolve(dir, '../.env') });
