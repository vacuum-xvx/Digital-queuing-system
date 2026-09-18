-- Тестовый оператор (пароль: operator1234, bcrypt cost=10)
INSERT INTO users (email, password_hash, role, is_terminal, confirmed)
VALUES ('operator@pochta.local', '$2a$10$9rE.JPFRj5xnpZplKdVRUebVNSl9PSx64nCYvnoU1vIQiFkNVFZYS', 'employee', false, true)
ON CONFLICT (email) DO NOTHING;
