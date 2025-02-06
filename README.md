# hft-flash
Shall be addressed later


```mermaid
graph TB
    User((Trader))

    subgraph "HFT Trading System"
        subgraph "Trading Application"
            TradingApp["Trading Application<br>Node.js"]
            
            subgraph "Core Components"
                AuthManager["Authentication Manager<br>JWT"]
                EnvValidator["Environment Validator<br>Node.js"]
                TimeManager["Time Manager<br>Node.js"]
                OrderManager["Order Manager<br>Node.js"]
                LogManager["Log Manager<br>Node.js"]
            end
            
            subgraph "Utility Components"
                TimeConverter["Time Converter<br>Node.js"]
                LogFormatter["Log Formatter<br>Colors.js"]
                FileHandler["File Handler<br>Node.js fs"]
            end
        end
        
        subgraph "External Services"
            AuthService["Authentication Service<br>REST API"]
            MarketTimeService["Market Time Service<br>REST API"]
            OrderService["Order Service<br>REST API"]
        end
        
        subgraph "Storage"
            LogStorage["Log Storage<br>File System"]
        end
    end

    %% User interactions
    User -->|"Configures and starts"| TradingApp

    %% Core component relationships
    TradingApp -->|"Uses"| AuthManager
    TradingApp -->|"Uses"| EnvValidator
    TradingApp -->|"Uses"| TimeManager
    TradingApp -->|"Uses"| OrderManager
    TradingApp -->|"Uses"| LogManager

    %% Utility relationships
    TimeManager -->|"Uses"| TimeConverter
    LogManager -->|"Uses"| LogFormatter
    LogManager -->|"Uses"| FileHandler

    %% External service interactions
    AuthManager -->|"Authenticates via"| AuthService
    TimeManager -->|"Fetches market time from"| MarketTimeService
    OrderManager -->|"Sends orders to"| OrderService

    %% Storage relationships
    LogManager -->|"Writes to"| LogStorage
    FileHandler -->|"Manages"| LogStorage

    %% Component interactions
    OrderManager -->|"Uses"| TimeManager
    OrderManager -->|"Uses"| LogManager
    TimeManager -->|"Uses"| LogManager
    AuthManager -->|"Uses"| LogManager
    EnvValidator -->|"Uses"| LogManager
```
