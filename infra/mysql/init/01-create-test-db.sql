CREATE DATABASE IF NOT EXISTS tapline_test;

GRANT ALL PRIVILEGES ON tapline_dev.* TO 'tapline_app'@'%';
GRANT ALL PRIVILEGES ON tapline_test.* TO 'tapline_app'@'%';
FLUSH PRIVILEGES;
