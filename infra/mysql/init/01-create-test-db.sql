CREATE DATABASE IF NOT EXISTS football_data_collector_test;

GRANT ALL PRIVILEGES ON football_data_collector_dev.* TO 'football_app'@'%';
GRANT ALL PRIVILEGES ON football_data_collector_test.* TO 'football_app'@'%';
FLUSH PRIVILEGES;
