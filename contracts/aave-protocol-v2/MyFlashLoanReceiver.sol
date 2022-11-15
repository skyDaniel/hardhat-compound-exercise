// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import { FlashLoanReceiverBase } from "./FlashLoanReceiverBase.sol";
import { ILendingPool } from "./ILendingPool.sol";
import { ILendingPoolAddressesProvider } from "./ILendingPoolAddressesProvider.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { CErc20 } from "../CErc20.sol";

import "../uniswap-v3/ISwapRouter.sol";
import "hardhat/console.sol"; // for printing debugging log in console

/** 
    !!!
    Never keep funds permanently on your FlashLoanReceiverBase contract as they could be 
    exposed to a 'griefing' attack, where the stored funds are used by an attacker.
    !!!
 */
contract MyFlashLoanReceiver is FlashLoanReceiverBase {
    ISwapRouter public swapRouter;
    IERC20 public debtToken;                   // USDC address
    IERC20 public collateralToken;            // UNI address
    CErc20 public c_debtToken;                 // cUSDC address
    CErc20 public c_collateralToken;          // cUNI address
    address public userToBeLiquidated;        // user1 address
    address public owner;

    constructor(
        ILendingPoolAddressesProvider _addressProvider,
        ISwapRouter _swapRouter,
        IERC20 _debtToken,
        IERC20 _collateralToken,
        CErc20 _c_debtToken,
        CErc20 _c_collateralToken,
        address _userToBeLiquidated
    ) FlashLoanReceiverBase(_addressProvider) {
        swapRouter = _swapRouter;
        debtToken = _debtToken;
        collateralToken = _collateralToken;
        c_debtToken = _c_debtToken;
        c_collateralToken = _c_collateralToken;
        userToBeLiquidated = _userToBeLiquidated;
        owner = msg.sender;
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(address[] calldata assets, uint256[] calldata amounts, 
                              uint256[] calldata premiums, address initiator, bytes calldata params) external override returns (bool)
    {
        // This contract now has the funds requested.
        // Your logic goes here.
        
        // At the end of your logic above, this contract owes
        // the flashloaned amounts + premiums.
        // Therefore ensure your contract has enough to repay
        // these amounts.

        require(assets[0] == address(debtToken));

        debtToken.approve(address(c_debtToken), amounts[0]);
        c_debtToken.liquidateBorrow(userToBeLiquidated, amounts[0], c_collateralToken);

        // Redeem cUNI to UNI
        uint c_collateralTokenRedeemAmount = c_collateralToken.balanceOf(address(this));
        c_collateralToken.redeem(c_collateralTokenRedeemAmount);

        console.log("Seized token (cUNI) from liquidating: %s cUNI", c_collateralTokenRedeemAmount);

        // Swap UNI to USDC:
        // Approve Uniswap to use all UNI balance
        uint collateralTokenBalance = collateralToken.balanceOf(address(this));
        collateralToken.approve(address(swapRouter), collateralTokenBalance);

        console.log("UNI: %s UNI", collateralTokenBalance);

        // https://docs.uniswap.org/protocol/guides/swaps/single-swaps
        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter.ExactInputSingleParams({
            tokenIn: address(collateralToken),
            tokenOut: address(debtToken),
            fee: 3000, // 0.3%
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: collateralTokenBalance,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        uint256 debtTokenAmountOut = swapRouter.exactInputSingle(swapParams);

        // Payback to AAVE
        for (uint i = 0; i < assets.length; i++) {
            uint amountPayback = amounts[i] + premiums[i];
            IERC20(assets[i]).approve(address(LENDING_POOL), amountPayback);
            IERC20(assets[i]).transfer(owner, debtTokenAmountOut - amountPayback);
            console.log("Send back %s USDC to user2", debtTokenAmountOut);
            console.log("Send back %s USDC to user2", debtTokenAmountOut - amountPayback);
        }

        return true;
    }

    function flashloan(address assetToBeFlashBorrowed, uint amount) public
    {
        address receiverAddress = address(this);

        address[] memory assets = new address[](1);
        assets[0] = assetToBeFlashBorrowed;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);

        bytes memory params = "";

        uint16 referralCode = 0;

        LENDING_POOL.flashLoan(
            receiverAddress, // The address of the contract receiving the funds, implementing the IFlashLoanReceiver interface
            assets,   // The addresses of the assets being flash-borrowed
            amounts,  // The amounts amounts being flash-borrowed
            modes,    // Types of the debt to open if the flash loan is not returned:
                      //   0 -> Don't open any debt, just revert if funds can't be transferred from the receiver
                      //   1 -> Open debt at stable rate for the value of the amount flash-borrowed to the `onBehalfOf` address
                      //   2 -> Open debt at variable rate for the value of the amount flash-borrowed to the `onBehalfOf` address
            onBehalfOf, // The address that will receive the debt in the case of using on `modes` 1 or 2
            params,     // Variadic packed params to pass to the receiver as extra information
            referralCode // Code used to register the integrator originating the operation, for potential rewards.
        );
    }




}