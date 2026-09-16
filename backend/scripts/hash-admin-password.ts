import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');

if (password.length < 12 || password.length > 256) {
    process.stderr.write('Admin password must be 12-256 characters.\n');
    process.exitCode = 1;
} else {
    const salt = randomBytes(16);
    const key = scryptSync(password, salt, 64, {
        N: 16_384,
        r: 8,
        p: 1,
    });
    process.stdout.write(
        `scrypt:16384:8:1:${salt.toString('hex')}:${key.toString('hex')}\n`,
    );
}
