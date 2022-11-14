const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

async function printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2)
{
    const scale = 1e18;
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
    console.log("  TokenA: " + POOL_TOKEN_A_BALANCE / scale);
    console.log("  TokenB: " + POOL_TOKEN_B_BALANCE / scale);

    console.log("User 1 Balance:");
    console.log("  TokenA: " + USER1_TOKEN_A_BALANCE / scale);
    console.log("  cTokenA: " + USER1_C_TOKEN_A_BALANCE / scale);
    console.log("  TokenB: " + USER1_TOKEN_B_BALANCE / scale);
    console.log("  cTokenB: " + USER1_C_TOKEN_B_BALANCE / scale);

    console.log("User 2 Balance:");
    console.log("  TokenA: " + USER2_TOKEN_A_BALANCE / scale);
    console.log("  cTokenA: " + USER2_C_TOKEN_A_BALANCE / scale);
    console.log("  TokenB: " + USER2_TOKEN_B_BALANCE / scale);
    console.log("  cTokenB: " + USER2_C_TOKEN_B_BALANCE / scale);

    console.log("----------------------------------------------------------------");
}


describe("CERC20 - Should be able to borrow/repay", function () {
    let owner; // owner who deploys all contracts
    let user1, user2, user3;

    const USER1_INITIAL_TOKEN_B_AMOUNT = ethers.utils.parseUnits("1", 18);
    const USER2_INITIAL_TOKEN_A_AMOUNT = ethers.utils.parseUnits("1000", 18);

    const USER1_CTOKEN_B_MINT_AMOUNT = ethers.utils.parseUnits("1", 18);
    const USER2_CTOKEN_A_MINT_AMOUNT = ethers.utils.parseUnits("100", 18);

    const USER1_BORROW_TOKEN_A_AMOUNT = ethers.utils.parseUnits("50", 18);

    const USER2_LIQUIDATE_TOKEN_A_AMOUNT = ethers.utils.parseUnits("35", 18);

    const TOKEN_A_INITIAL_SUPPLY = ethers.utils.parseUnits("10000", 18); // 10000 * 10^18
    const TOKEN_B_INITIAL_SUPPLY = ethers.utils.parseUnits("10000", 18); // 10000 * 10^18

    const TOKEN_A_INITIAL_PRICE = ethers.utils.parseUnits("1", 18);
    const TOKEN_B_INITIAL_PRICE = ethers.utils.parseUnits("100", 18);
    const TOKEN_B_NEW_PRICE = ethers.utils.parseUnits("80", 18);

    const TOKEN_B_INITIAL_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const TOKEN_B_NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.3", 18);

    const CLOSE_FACTOR = ethers.utils.parseUnits("0.7", 18);
    const LIQUIDATION_INCENTIVE = ethers.utils.parseUnits("1.08", 18); // 8% extra reward for conducting liquidation
    
    // 2.8% of the seized tokens from liquidation will be distributed to the reserve
    // (defined in CTokenInterface.sol, and used in CToken::seizeInternal())
    const PROTOCOL_SEIZE_SHARE = ethers.utils.parseUnits("0.028", 18); 

    const EXPECTED_SEIZED_TOKEN_MULTIPLER = 1.08 * (1 - 0.028);

    async function deployContracts() {
        const comptrollerFactory = await ethers.getContractFactory("Comptroller");
        const comptroller = await comptrollerFactory.deploy();
        await comptroller.deployed();

        const priceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
        const priceOracle = await priceOracleFactory.deploy();
        await priceOracle.deployed();
        await comptroller._setPriceOracle(priceOracle.address);

        // Underlying ERC20 token
        const erc20Factory = await ethers.getContractFactory("TestErc20");
        const erc20TokenA = await erc20Factory.deploy(
            TOKEN_A_INITIAL_SUPPLY, // 10000 * 10^18
            "Token A",
            "A"
        );
        await erc20TokenA.deployed();
        const erc20TokenB = await erc20Factory.deploy(
            TOKEN_B_INITIAL_SUPPLY, // 10000 * 10^18
            "Token B",
            "B"
        );
        await erc20TokenB.deployed();

        const interestRateModelFactory = await ethers.getContractFactory(
            "WhitePaperInterestRateModel"
        );
        const interestRateModel = await interestRateModelFactory.deploy(
            ethers.utils.parseUnits("0", 18), // baseRatePerYear: 0 * 10^18
            ethers.utils.parseUnits("0", 18) // multiplierPerYear: 0 * 10^18
        );
        await interestRateModel.deployed();

        const cErc20Factory = await ethers.getContractFactory("CErc20");
        const cErc20TokenA = await cErc20Factory.deploy();
        await cErc20TokenA.deployed();
        await cErc20TokenA["initialize(address,address,address,uint256,string,string,uint8)"](
            erc20TokenA.address,                     // address underlying_
            comptroller.address,               // address comptroller_
            interestRateModel.address,         // address interestRateModel_
            ethers.utils.parseUnits("1", 18),  // uint256 initialExchangeRateMantissa_: 1 * 10^18
            "Compound Token A",                // string name_
            "cA",                              // string symbol_
            18                                 // uint8 decimals_
        );
        const cErc20TokenB = await cErc20Factory.deploy();
        await cErc20TokenB.deployed();
        await cErc20TokenB["initialize(address,address,address,uint256,string,string,uint8)"](
            erc20TokenB.address,                     // address underlying_
            comptroller.address,               // address comptroller_
            interestRateModel.address,         // address interestRateModel_
            ethers.utils.parseUnits("1", 18),  // uint256 initialExchangeRateMantissa_: 1 * 10^18
            "Compound Token B",                // string name_
            "cB",                              // string symbol_
            18                                 // uint8 decimals_
        );

        await comptroller._supportMarket(cErc20TokenA.address);
        await comptroller._supportMarket(cErc20TokenB.address);
        
        // Set the price of token A & token B
        await priceOracle.setDirectPrice(erc20TokenA.address, TOKEN_A_INITIAL_PRICE);
        await priceOracle.setDirectPrice(erc20TokenB.address, TOKEN_B_INITIAL_PRICE);
        
        await comptroller._setCollateralFactor(cErc20TokenB.address, TOKEN_B_INITIAL_COLLATERAL_FACTOR);
        await comptroller._setCloseFactor(CLOSE_FACTOR);
        await comptroller._setLiquidationIncentive(LIQUIDATION_INCENTIVE);

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

    async function initializeTokenStatus() {
        const {
            comptroller, 
            priceOracle, 
            erc20TokenA, 
            erc20TokenB, 
            interestRateModel, 
            cErc20TokenA, 
            cErc20TokenB 
        } = await loadFixture(deployContracts);
        
        // First, give user1 & user2 initial balance for tokenA & token
        // Mint 1 tokenB for user1
        await erc20TokenB.connect(user1).mint(USER1_INITIAL_TOKEN_B_AMOUNT);
        expect(await erc20TokenB.balanceOf(user1.address)).to.equal(USER1_INITIAL_TOKEN_B_AMOUNT);
        // Mint 1000 tokenA for user2
        await erc20TokenA.connect(user2).mint(USER2_INITIAL_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(user2.address)).to.equal(USER2_INITIAL_TOKEN_A_AMOUNT);

        console.log("[Initial state]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);
        
        // User1: Provide liquidity for tokenB by minting cTokenB from the pool
        await erc20TokenB.connect(user1).approve(cErc20TokenB.address, USER1_CTOKEN_B_MINT_AMOUNT);
        await cErc20TokenB.connect(user1).mint(USER1_CTOKEN_B_MINT_AMOUNT);
        expect(await erc20TokenB.balanceOf(cErc20TokenB.address)).to.equal(USER1_CTOKEN_B_MINT_AMOUNT);
        expect(await cErc20TokenB.balanceOf(user1.address)).to.equal(USER1_CTOKEN_B_MINT_AMOUNT);

        // User2: Provide liquidity for tokenA by minting cTokenA from the pool
        await erc20TokenA.connect(user2).approve(cErc20TokenA.address, USER2_CTOKEN_A_MINT_AMOUNT);
        await cErc20TokenA.connect(user2).mint(USER2_CTOKEN_A_MINT_AMOUNT);
        expect(await erc20TokenA.balanceOf(cErc20TokenA.address)).to.equal(USER2_CTOKEN_A_MINT_AMOUNT);
        expect(await cErc20TokenA.balanceOf(user2.address)).to.equal(USER2_CTOKEN_A_MINT_AMOUNT);
        
        console.log("[After providing liquidity]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

        await comptroller.connect(user1).enterMarkets([cErc20TokenB.address]);

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

    it("User1: Borrow 50 tokenA using 1 tokenB as the collateral, and then repay 50 tokenA to the pool", async function () {
        const {
            comptroller, 
            priceOracle, 
            erc20TokenA, 
            erc20TokenB, 
            interestRateModel, 
            cErc20TokenA, 
            cErc20TokenB 
        } = await loadFixture(initializeTokenStatus);

        // User1: Borrow 50 tokenA from the pool
        await cErc20TokenA.connect(user1).borrow(USER1_BORROW_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(user1.address)).to.equal(USER1_BORROW_TOKEN_A_AMOUNT);

        console.log("[After user1 borrows 50 tokenA from the pool]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

        await erc20TokenA.connect(user1).approve(cErc20TokenA.address, USER1_BORROW_TOKEN_A_AMOUNT);
        await cErc20TokenA.connect(user1).repayBorrow(USER1_BORROW_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(user1.address)).to.equal(0);

        console.log("[After user1 repays 50 tokenA to the pool]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

    });

    it("Change collateral factor for tokenB from 0.5 to 0.3, then let user2 liquidate user1's position", async function () {
        const {
            comptroller, 
            priceOracle, 
            erc20TokenA, 
            erc20TokenB, 
            interestRateModel, 
            cErc20TokenA, 
            cErc20TokenB 
        } = await loadFixture(initializeTokenStatus);

        // User1: Borrow 50 tokenA from the pool
        await cErc20TokenA.connect(user1).borrow(USER1_BORROW_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(user1.address)).to.equal(USER1_BORROW_TOKEN_A_AMOUNT);

        console.log("[After user1 borrows 50 tokenA from the pool]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

        // Change collateral factor from 0.5 to 0.3
        await comptroller._setCollateralFactor(cErc20TokenB.address, TOKEN_B_NEW_COLLATERAL_FACTOR);

        // User2: Liquidate 70% tokenA loans for user1, and then seize tokenB from the collateral
        await erc20TokenA.connect(user2).approve(cErc20TokenA.address, USER2_LIQUIDATE_TOKEN_A_AMOUNT);
        await cErc20TokenA.connect(user2).liquidateBorrow(user1.address, USER2_LIQUIDATE_TOKEN_A_AMOUNT, cErc20TokenB.address);

        let tokenAPrice = await priceOracle.getUnderlyingPrice(cErc20TokenA.address);
        let tokenBPrice = await priceOracle.getUnderlyingPrice(cErc20TokenB.address);
        let expectedSeizedToken = USER2_LIQUIDATE_TOKEN_A_AMOUNT.mul(tokenAPrice).div(tokenBPrice).mul(EXPECTED_SEIZED_TOKEN_MULTIPLER * 1e5).div(1e5);
        expect(await cErc20TokenB.balanceOf(user2.address)).to.equal(expectedSeizedToken);

        console.log("[After user2 liquidate 70% tokenA loans for user1]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

    });

    it("Change tokenB price from 100 to 80, then let user2 liquidate user1's position", async function () {
        const {
            comptroller, 
            priceOracle, 
            erc20TokenA, 
            erc20TokenB, 
            interestRateModel, 
            cErc20TokenA, 
            cErc20TokenB 
        } = await loadFixture(initializeTokenStatus);

        // User1: Borrow 50 tokenA from the pool
        await cErc20TokenA.connect(user1).borrow(USER1_BORROW_TOKEN_A_AMOUNT);
        expect(await erc20TokenA.balanceOf(user1.address)).to.equal(USER1_BORROW_TOKEN_A_AMOUNT);

        console.log("[After user1 borrows 50 tokenA from the pool]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

        // Change tokenB price from 100 to 80
        await priceOracle.setDirectPrice(erc20TokenB.address, TOKEN_B_NEW_PRICE);

        // User2: Liquidate 70% tokenA loans for user1, and then seize tokenB from the collateral
        await erc20TokenA.connect(user2).approve(cErc20TokenA.address, USER2_LIQUIDATE_TOKEN_A_AMOUNT);
        await cErc20TokenA.connect(user2).liquidateBorrow(user1.address, USER2_LIQUIDATE_TOKEN_A_AMOUNT, cErc20TokenB.address);

        let tokenAPrice = await priceOracle.getUnderlyingPrice(cErc20TokenA.address);
        let tokenBPrice = await priceOracle.getUnderlyingPrice(cErc20TokenB.address);
        let expectedSeizedToken = USER2_LIQUIDATE_TOKEN_A_AMOUNT.mul(tokenAPrice).div(tokenBPrice).mul(EXPECTED_SEIZED_TOKEN_MULTIPLER * 1e5).div(1e5);
        expect(await cErc20TokenB.balanceOf(user2.address)).to.equal(expectedSeizedToken);

        console.log("[After user2 liquidate 70% tokenA loans for user1]");
        await printTokenBalances(erc20TokenA, erc20TokenB, cErc20TokenA, cErc20TokenB, user1, user2);

    });


});
