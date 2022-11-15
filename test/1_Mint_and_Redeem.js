const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

describe("CERC20 - Should be able to mint/redeem with token A", function () {
    let owner; // owner who deploys all contracts
    let user1, user2;

    const ERC20_SUPPLY_AMOUNT = ethers.utils.parseUnits("10000", 18); // 10000 * 10^18
    
    const USER1_INITIAL_ERC20_AMOUNT = ethers.utils.parseUnits("500", 18);
    const CERC20_MINT_AMOUNT = ethers.utils.parseUnits("100", 18);

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
        const erc20 = await erc20Factory.deploy(
            ERC20_SUPPLY_AMOUNT, // 10000 * 10^18
            "My token",
            "mtoken"
        );
        await erc20.deployed();

        const interestRateModelFactory = await ethers.getContractFactory(
            "WhitePaperInterestRateModel"
        );
        const interestRateModel = await interestRateModelFactory.deploy(
            ethers.utils.parseUnits("0", 18), // baseRatePerYear: 0 * 10^18
            ethers.utils.parseUnits("0", 18) // multiplierPerYear: 0 * 10^18
        );
        await interestRateModel.deployed();

        const cErc20Factory = await ethers.getContractFactory("CErc20");
        const cErc20 = await cErc20Factory.deploy();
        await cErc20.deployed();

        // console.log(cErc20);
        await cErc20["initialize(address,address,address,uint256,string,string,uint8)"](
            erc20.address,                     // address underlying_
            comptroller.address,               // address comptroller_
            interestRateModel.address,         // address interestRateModel_
            ethers.utils.parseUnits("1", 18),  // uint256 initialExchangeRateMantissa_: 1 * 10^18
            "Compound test token",             // string name_
            "cMyToken",                        // string symbol_
            18                                 // uint8 decimals_
        );
        await comptroller._supportMarket(cErc20.address);

        return { comptroller, priceOracle, erc20, interestRateModel, cErc20 };
    }

    before(async () => {
        [owner, user1, user2] = await ethers.getSigners();
    });

    it("Deploy contracts", async function () {
        const { comptroller, priceOracle, erc20, interestRateModel, cErc20 } = await loadFixture(deployContracts);
        expect(comptroller.address).to.exist;
        expect(comptroller.deployTransaction.from).to.equal(owner.address);
        
        expect(priceOracle.address).to.exist;
        expect(priceOracle.deployTransaction.from).to.equal(owner.address);

        expect(await comptroller.oracle()).to.equal(priceOracle.address);

        expect(erc20.address).to.exist;
        expect(erc20.deployTransaction.from).to.equal(owner.address);

        expect(interestRateModel.address).to.exist;
        expect(interestRateModel.deployTransaction.from).to.equal(owner.address);

        expect(cErc20.address).to.exist;
        expect(cErc20.deployTransaction.from).to.equal(owner.address);
    });

    it("Mint 100 cERC20 tokens, and then redeem 100 ERC20 tokens from cERC20", async function () {
        const { erc20, cErc20 } = await loadFixture(deployContracts);

        // First, mint 500 ERC20 tokens for user1
        await erc20.connect(user1).mint(USER1_INITIAL_ERC20_AMOUNT);
        expect(await erc20.balanceOf(user1.address)).to.equal(USER1_INITIAL_ERC20_AMOUNT);

        // Mint 100 CERC20 tokens for user1
        await erc20.connect(user1).approve(cErc20.address, CERC20_MINT_AMOUNT);
        await cErc20.connect(user1).mint(CERC20_MINT_AMOUNT);

        expect(await erc20.balanceOf(cErc20.address)).to.equal(CERC20_MINT_AMOUNT);
        expect(await cErc20.balanceOf(user1.address)).to.equal(CERC20_MINT_AMOUNT);

        // Redeem 100 ERC20 tokens to user1
        await cErc20.connect(user1).redeem(CERC20_MINT_AMOUNT);

        expect(await erc20.balanceOf(cErc20.address)).to.equal(0);
        expect(await erc20.balanceOf(user1.address)).to.equal(USER1_INITIAL_ERC20_AMOUNT);
        expect(await cErc20.balanceOf(user1.address)).to.equal(0);
        
    });

});
