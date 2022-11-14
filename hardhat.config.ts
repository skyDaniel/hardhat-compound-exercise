require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    // networks: {
    //     hardhat: {
    //         forking: {
    //             url: "https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY",
    //             blockNumber: 15815693,
    //             enable: true
    //         }
    //     }
    // },
    solidity: {
        compilers: [
            {
                version: "0.8.17",
                settings : {
                    optimizer: {
                        enabled: true,
                        runs: 1000
                    }
                }
            }
      ]
    }
};
