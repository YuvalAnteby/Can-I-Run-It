export const TEST_ADMIN_USERNAME = 'test-admin';
export const TEST_ADMIN_PASSWORD = 'correct horse battery staple';
export const TEST_ADMIN_ORIGIN = 'http://localhost:3000';
export const TEST_ADMIN_PASSWORD_HASH =
    'scrypt:16384:8:1:000102030405060708090a0b0c0d0e0f:' +
    'd7590aca2c9801cf06eeba772a69dc31ce3862591d96522ac4e6bba6ad1f31a52d6f736f2b85adaa6262335eb112e56f014f417a37d74be0def7669b2c51c29e';

process.env.ADMIN_USERNAME = TEST_ADMIN_USERNAME;
process.env.ADMIN_PASSWORD_HASH = TEST_ADMIN_PASSWORD_HASH;
process.env.REACT_URL = TEST_ADMIN_ORIGIN;
