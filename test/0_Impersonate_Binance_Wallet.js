const { LogLevel, Logger } = require('@ethersproject/logger');
const { expect } = require("chai");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

describe("Impersonation", function () {
    const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const BINANCE_WALLET_ADDRESS = '0xF977814e90dA44bFA03b6295A0616a897441aceC';

    let usdc;

    it("There should be some USDC in Binance's wallet", async function () {
        usdc = await ethers.getContractAt("ERC20", USDC_CONTRACT_ADDRESS);
        let binance_usdc_balance = await usdc.balanceOf(BINANCE_WALLET_ADDRESS);
        expect(binance_usdc_balance).to.gt(0);
        console.log(`Binance wallet USDC balance: ${binance_usdc_balance}`);
    });

    it("Let Binance to give me some USDC", async function () {
        let [owner, user1, user2, user3] = await ethers.getSigners();

        let transferAmount = 100000000;
        await impersonateAccount(BINANCE_WALLET_ADDRESS); // from hardhet-network-helpers

        const BINANCE_WALLET = await ethers.getSigner(
            BINANCE_WALLET_ADDRESS
        );

        await usdc.connect(BINANCE_WALLET).transfer(user3.address, transferAmount);
        let balance = await usdc.balanceOf(user3.address);
        console.log(`Our wallet USDC balance: ${balance}`);
        expect(balance).to.eq(transferAmount);
    });
});
