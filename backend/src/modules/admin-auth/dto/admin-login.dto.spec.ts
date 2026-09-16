import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AdminLoginDto } from './admin-login.dto';

it('accepts nonempty bounded username and password without trimming the password', async () => {
    const dto = plainToInstance(AdminLoginDto, {
        username: 'admin',
        password: ' secret ',
    });

    expect(dto.password).toBe(' secret ');
    expect(await validate(dto)).toHaveLength(0);
});

it('rejects missing, empty, and oversized login fields', async () => {
    const dto = plainToInstance(AdminLoginDto, {
        username: 'a'.repeat(101),
        password: 'b'.repeat(257),
    });

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(
        expect.arrayContaining(['username', 'password']),
    );
});

it.each([
    [{ username: 123, password: 'password' }, 'username'],
    [{ username: 'admin', password: { value: 'password' } }, 'password'],
])(
    'rejects non-string %s credentials even when implicit conversion is enabled',
    async (credentials, property) => {
        const dto = plainToInstance(AdminLoginDto, credentials, {
            enableImplicitConversion: true,
        });

        const properties = (await validate(dto)).map((error) => error.property);

        expect(properties).toContain(property);
    },
);
