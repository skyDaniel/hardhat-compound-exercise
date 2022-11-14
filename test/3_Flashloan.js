const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

describe("Flashloan", function () {
    let owner; // owner who deploys all contracts
    let user1, user2, user3;

    const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const BINANCE_WALLET_ADDRESS = '0xF977814e90dA44bFA03b6295A0616a897441aceC';

    const C_TOKEN_DECIMAL = 18;
    const CLOSE_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const LIQUIDATION_INCENTIVE = ethers.utils.parseUnits("1.10", 18); // 10% extra reward for conducting liquidation
    const TOKEN_B_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);

    // Token A: USDC ($1)
    // Token B: UNI ($10)
    const TOKEN_A_INITIAL_PRICE = ethers.utils.parseUnits("1", 30); // price should * 10^12 given that decimal of USDC is 6
    const TOKEN_B_INITIAL_PRICE = ethers.utils.parseUnits("10", 18);
    const TOKEN_B_NEW_PRICE = ethers.utils.parseUnits("6.2", 18);
    
    const USER1_INITIAL_UNI_AMOUNT = ethers.utils.parseUnits("5000", 6); // decimal of USDC is 6
    const USDC_AMOUNT = ethers.utils.parseUnits("1000", 18);

    let usdc;

    before(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();
    });

    it("There should be some USDC in Binance's wallet", async function () {
        usdc = await ethers.getContractAt("ERC20", USDC_CONTRACT_ADDRESS);
        let binance_usdc_balance = await usdc.balanceOf(BINANCE_WALLET_ADDRESS);
        expect(binance_usdc_balance).to.gt(0);
        console.log(`Binance wallet USDC balance: ${binance_usdc_balance}`);
    });

    it("Let Binance to give me some USDC", async function () {
        let transferAmount = 100000000;
        await impersonateAccount(BINANCE_WALLET_ADDRESS); // from hardhet-network-helpers

        const BINANCE_WALLET = await ethers.getSigner(
            BINANCE_WALLET_ADDRESS
        );

        await usdc.connect(BINANCE_WALLET).transfer(user1.address, transferAmount);
        let balance = await usdc.balanceOf(user1.address);
        console.log(`Our wallet USDC balance: ${balance}`);
        expect(balance).to.eq(transferAmount);
    });

});
