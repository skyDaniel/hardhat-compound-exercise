const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

async function printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2)
{
    const scaleA = 1e6;
    const scaleCA = 1e18;
    const scaleB = 1e18;
    const scaleCB = 1e18;
    
    const POOL_TOKEN_A_BALANCE = await erc20TokenA.balanceOf(cErc20TokenA.address);
    const POOL_TOKEN_B_BALANCE = await erc20TokenB.balanceOf(cErc20TokenB.address);
    const USER1_TOKEN_A_BALANCE = await erc20TokenA.balanceOf(user1.address);
    const USER1_C_TOKEN_A_BALANCE = await cErc20TokenA.balanceOf(user1.address);
    const USER1_TOKEN_B_BALANCE = await erc20TokenB.balanceOf(user1.address);
    const USER1_C_TOKEN_B_BALANCE = await cErc20TokenB.balanceOf(user1.address);

    const USER2_TOKEN_A_BALANCE = await erc20TokenA.balanceOf(user2.address);
    const USER2_C_TOKEN_A_BALANCE = await cErc20TokenA.balanceOf(user2.address);
    const USER2_TOKEN_B_BALANCE = await erc20TokenB.balanceOf(user2.address);
    const USER2_C_TOKEN_B_BALANCE = await cErc20TokenB.balanceOf(user2.address);

    console.log("----------------------------------------------------------------");

    console.log("Pool Balance:");
    console.log("  USDC: " + POOL_TOKEN_A_BALANCE / scaleA);
    console.log("  UNI : " + POOL_TOKEN_B_BALANCE / scaleB);

    console.log("User 1 Balance:");
    console.log("  USDC : " + USER1_TOKEN_A_BALANCE / scaleA);
    console.log("  cUSDC: " + USER1_C_TOKEN_A_BALANCE / scaleCA);
    console.log("  UNI  : " + USER1_TOKEN_B_BALANCE / scaleB);
    console.log("  cUNI : " + USER1_C_TOKEN_B_BALANCE / scaleCB);

    console.log("User 2 Balance:");
    console.log("  USDC : " + USER2_TOKEN_A_BALANCE / scaleA);
    console.log("  cUSDC: " + USER2_C_TOKEN_A_BALANCE / scaleCA);
    console.log("  UNI  : " + USER2_TOKEN_B_BALANCE / scaleB);
    console.log("  cUNI : " + USER2_C_TOKEN_B_BALANCE / scaleCB);

    console.log("----------------------------------------------------------------");
}

describe("Flashloan", function () {
    let owner; // owner who deploys all contracts
    let user1, user2, user3;

    const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // Token A
    const UNI_CONTRACT_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'; // Token B

    const BINANCE_WALLET_ADDRESS = '0xF977814e90dA44bFA03b6295A0616a897441aceC';

    const C_TOKEN_DECIMAL = 18;
    const CLOSE_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const LIQUIDATION_INCENTIVE = ethers.utils.parseUnits("1.10", 18); // 10% extra reward for conducting liquidation
    const TOKEN_B_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);

    // Token A: USDC ($1)
    // Token B: UNI ($10)
    const TOKEN_A_INITIAL_PRICE = ethers.utils.parseUnits("1", 30); // 36 - (decimal of USDC) = 30
    const TOKEN_B_INITIAL_PRICE = ethers.utils.parseUnits("10", 18);
    const TOKEN_B_NEW_PRICE = ethers.utils.parseUnits("6.2", 18);
    
    const USER1_INITIAL_TOKEN_B_AMOUNT = ethers.utils.parseUnits("1000", 18); // 1,000 UNI
    const USER2_INITIAL_TOKEN_A_AMOUNT = ethers.utils.parseUnits("5000", 6); // 20,000 USDC (decimal of USDC is 6)
    const USER1_BORROW_TOKEN_A_AMOUNT = ethers.utils.parseUnits("5000", 6);   // 5,000 USDC (decimal of USDC is 6)

    const USER1_CTOKEN_B_MINT_UNDERLYING_AMOUNT = ethers.utils.parseUnits("1000", 18);
    const USER1_CTOKEN_B_MINT_AMOUNT = ethers.utils.parseUnits("1000", 18);
    
    const USER2_CTOKEN_A_MINT_UNDERLYING_AMOUNT = ethers.utils.parseUnits("5000", 6); // amount of USDC liquidity user2 provided to pool
    const USER2_CTOKEN_A_MINT_AMOUNT = ethers.utils.parseUnits("5000", 18);

    async function initializeContracts() {
        const comptrollerFactory = await ethers.getContractFactory("Comptroller");
        const comptroller = await comptrollerFactory.deploy();
        await comptroller.deployed();

        const priceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
        const priceOracle = await priceOracleFactory.deploy();
        await priceOracle.deployed();

        const interestRateModelFactory = await ethers.getContractFactory(
            "WhitePaperInterestRateModel"
        );
        const interestRateModel = await interestRateModelFactory.deploy(
            ethers.utils.parseUnits("0", 18), // baseRatePerYear: 0 * 10^18
            ethers.utils.parseUnits("0", 18) // multiplierPerYear: 0 * 10^18
        );
        await interestRateModel.deployed();

        // Underlying ERC20 Token A: USDC
        const erc20TokenA = await ethers.getContractAt("ERC20", USDC_CONTRACT_ADDRESS);

        // Underlying ERC20 Token B: UNI
        const erc20TokenB = await ethers.getContractAt("ERC20", UNI_CONTRACT_ADDRESS);

        // cUSDC
        const cErc20Factory = await ethers.getContractFactory("CErc20");
        const cErc20TokenA = await cErc20Factory.deploy();
        await cErc20TokenA.deployed();
        await cErc20TokenA["initialize(address,address,address,uint256,string,string,uint8)"](
            USDC_CONTRACT_ADDRESS,             // address underlying_
            comptroller.address,               // address comptroller_
            interestRateModel.address,         // address interestRateModel_
            ethers.utils.parseUnits("1", 6),   // uint256 initialExchangeRateMantissa_
            "Compound USDC",                   // string name_
            "cUSDC",                           // string symbol_
            C_TOKEN_DECIMAL                    // uint8 decimals_
        );

        // cUNI
        const cErc20TokenB = await cErc20Factory.deploy();
        await cErc20TokenB.deployed();
        await cErc20TokenB["initialize(address,address,address,uint256,string,string,uint8)"](
            UNI_CONTRACT_ADDRESS,              // address underlying_
            comptroller.address,               // address comptroller_
            interestRateModel.address,         // address interestRateModel_
            ethers.utils.parseUnits("1", 18),  // uint256 initialExchangeRateMantissa_
            "Compound Uniswap",                // string name_
            "cUNI",                            // string symbol_
            C_TOKEN_DECIMAL                    // uint8 decimals_
        );

        await comptroller._setPriceOracle(priceOracle.address);

        await comptroller._supportMarket(cErc20TokenA.address);
        await comptroller._supportMarket(cErc20TokenB.address);
        
        // Set the price of token A & token B
        await priceOracle.setDirectPrice(erc20TokenA.address, TOKEN_A_INITIAL_PRICE); // USDC: $1 (decimal: 6)
        await priceOracle.setDirectPrice(erc20TokenB.address, TOKEN_B_INITIAL_PRICE); // UNI: $10 (decimal: 18)
        
        await comptroller._setCollateralFactor(cErc20TokenB.address, TOKEN_B_COLLATERAL_FACTOR);
        await comptroller._setCloseFactor(CLOSE_FACTOR);
        await comptroller._setLiquidationIncentive(LIQUIDATION_INCENTIVE);

        return {
            comptroller,
            priceOracle,
            erc20TokenA,
            erc20TokenB,
            interestRateModel,
            cErc20TokenA,
            cErc20TokenB,
            // flashLoan
        };
    }

    async function initializeTokenStatus() {
        const {
            comptroller,
            priceOracle,
            erc20TokenA,
            erc20TokenB,
            interestRateModel,
            cErc20TokenA,
            cErc20TokenB,
            // flashLoan
        } = await loadFixture(initializeContracts);
        
        // First, impersonate as Binance to give user1 & user2 initial balance for tokenA (USDC) & tokenB (UNI)
        await impersonateAccount(BINANCE_WALLET_ADDRESS); // from hardhet-network-helpers
        const BINANCE_WALLET = await ethers.getSigner(
            BINANCE_WALLET_ADDRESS
        );

        // Give 1,000 tokenB (UNI) to user1
        await erc20TokenB.connect(BINANCE_WALLET).transfer(user1.address, USER1_INITIAL_TOKEN_B_AMOUNT);
        expect(await erc20TokenB.balanceOf(user1.address)).to.equal(USER1_INITIAL_TOKEN_B_AMOUNT);

        // Give 5,000 tokenA (USDC) to pool
        await erc20TokenA.connect(BINANCE_WALLET).transfer(cErc20TokenA.address, USER2_INITIAL_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(cErc20TokenA.address)).to.equal(USER2_INITIAL_TOKEN_A_AMOUNT);
        
        console.log("[Initial state]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);
        
        // User1: Provide liquidity for tokenB by minting cTokenB from the pool
        await erc20TokenB.connect(user1).approve(cErc20TokenB.address, USER1_CTOKEN_B_MINT_UNDERLYING_AMOUNT);
        await cErc20TokenB.connect(user1).mint(USER1_CTOKEN_B_MINT_UNDERLYING_AMOUNT);
        expect(await erc20TokenB.balanceOf(cErc20TokenB.address)).to.equal(USER1_CTOKEN_B_MINT_UNDERLYING_AMOUNT);
        expect(await cErc20TokenB.balanceOf(user1.address)).to.equal(USER1_CTOKEN_B_MINT_AMOUNT);

        // // User2: Provide liquidity for tokenA by minting cTokenA from the pool
        // await erc20TokenA.connect(user2).approve(cErc20TokenA.address, USER2_CTOKEN_A_MINT_UNDERLYING_AMOUNT);
        // await cErc20TokenA.connect(user2).mint(USER2_CTOKEN_A_MINT_UNDERLYING_AMOUNT);
        // expect(await erc20TokenA.balanceOf(cErc20TokenA.address)).to.equal(USER2_CTOKEN_A_MINT_UNDERLYING_AMOUNT);
        // expect(await cErc20TokenA.balanceOf(user2.address)).to.equal(USER2_CTOKEN_A_MINT_AMOUNT);
        
        console.log("[After providing liquidity]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

        await comptroller.connect(user1).enterMarkets([cErc20TokenB.address]);

        // User1: Borrow 5000 tokenB (USDC) from the pool
        await cErc20TokenA.connect(user1).borrow(USER1_BORROW_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(user1.address)).to.equal(USER1_BORROW_TOKEN_A_AMOUNT);

        console.log("[After user1 borrows 50 tokenA from the pool]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

        return {
            comptroller,
            priceOracle,
            erc20TokenA,
            erc20TokenB,
            interestRateModel,
            cErc20TokenA,
            cErc20TokenB
        };
    }

    before(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();
    });

    it("Change tokenB (UNI) price from $10 to $6.2, then let user2 liquidate user1's position with AAVE Flashloan V2", async function () {
        const {
            comptroller,
            priceOracle,
            erc20TokenA,
            erc20TokenB,
            interestRateModel,
            cErc20TokenA,
            cErc20TokenB
        } = await loadFixture(initializeTokenStatus);

        await priceOracle.setDirectPrice(erc20TokenB.address, TOKEN_B_NEW_PRICE); // UNI: $6.2 (decimal: 18)

        // Check user1 shortfall > 0
        const [error, user1Liquidity, user1Shortfall] = await comptroller.getAccountLiquidity(user1.address);
        expect(error).to.equal(0);
        expect(user1Liquidity).to.equal(0);
        expect(user1Shortfall).to.gt(0);
    });

});
