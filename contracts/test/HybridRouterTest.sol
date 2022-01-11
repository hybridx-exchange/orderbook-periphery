pragma solidity =0.6.6;

import "../HybridRouter.sol";

contract HybridRouterTest is HybridRouter {
    using SafeMath for uint;

    constructor(address _factory, address _WETH) public HybridRouter (_factory, _WETH) {
    }

    //get buy amount with price based on price and offered amount
    function getBuyAmountWithPrice(uint amountOffer, uint price, uint decimal) internal pure returns (uint amountGet){
        amountGet = amountOffer.mul(10 ** decimal).div(price);
    }

    //get sell amount with price based on price and offered amount
    function getSellAmountWithPrice(uint amountOffer, uint price, uint decimal) internal pure returns (uint amountGet){
        amountGet = amountOffer.mul(price).div(10 ** decimal);
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) public pure returns (uint amountOut) {
        require(amountIn > 0, 'OrderBookLibrary: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'OrderBookLibrary: INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) public pure returns (uint amountIn) {
        require(amountOut > 0, 'OrderBookLibrary: INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'OrderBookLibrary: INSUFFICIENT_LIQUIDITY');
        uint numerator = reserveIn.mul(amountOut).mul(1000);
        uint denominator = reserveOut.sub(amountOut).mul(997);
        amountIn = (numerator / denominator).add(1);
    }

    function getPrice(uint reserveBase, uint reserveQuote, uint decimal) public pure returns (uint price){
        if (reserveBase != 0) {
            uint d = reserveQuote.mul(10 ** decimal);
            price = d / reserveBase;
        }
    }

    //sqrt(9*y*y + 3988000*x*y*price)
    function getSection1ForPriceUp(uint reserveIn, uint reserveOut, uint price, uint decimal)
    public
    pure
    returns (uint section1) {
        section1 = Math.sqrt(reserveOut.mul(reserveOut).mul(9).add(reserveIn.mul(reserveOut).mul(3988000).mul
        (price).div(10**decimal)));
    }

    //sqrt(9*x*x + 3988000*x*y/price)
    function getSection1ForPriceDown(uint reserveIn, uint reserveOut, uint price, uint decimal)
    public
    pure
    returns (uint section1) {
        section1 = Math.sqrt(reserveIn.mul(reserveIn).mul(9).add(reserveIn.mul(reserveOut).mul(3988000).mul
        (10**decimal).div(price)));
    }

    //amountIn = (sqrt(9*x*x + 3988000*x*y/price)-1997*x)/1994 = (sqrt(x*(9*x + 3988000*y/price))-1997*x)/1994
    //amountOut = y-(x+amountIn)*price
    function getAmountForMovePrice(
        uint direction,
        uint amountIn,
        uint reserveBase,
        uint reserveQuote,
        uint price,
        uint decimal)
    public
    pure
    returns (uint amountInLeft, uint amountBase, uint amountQuote, uint reserveBaseNew, uint reserveQuoteNew) {
        if (direction == OrderBookLibrary.LIMIT_BUY) {
            uint section1 = getSection1ForPriceUp(reserveBase, reserveQuote, price, decimal);
            uint section2 = reserveQuote.mul(1997);
            amountQuote = section1 > section2 ? (section1 - section2).div(1994) : 0;
            amountQuote = amountQuote > amountIn ? amountIn : amountQuote;
            amountBase = amountQuote == 0 ? 0 : getAmountOut(amountQuote, reserveQuote, reserveBase);
            (amountInLeft, reserveBaseNew, reserveQuoteNew) =
            (amountIn - amountQuote, reserveBase - amountBase, reserveQuote + amountQuote);
        }
        else if (direction == OrderBookLibrary.LIMIT_SELL) {
            uint section1 = getSection1ForPriceDown(reserveBase, reserveQuote, price, decimal);
            uint section2 = reserveBase.mul(1997);
            amountBase = section1 > section2 ? (section1 - section2).div(1994) : 0;
            amountBase = amountBase > amountIn ? amountIn : amountBase;
            amountQuote = amountBase == 0 ? 0 : getAmountOut(amountBase, reserveBase, reserveQuote);
            (amountInLeft, reserveBaseNew, reserveQuoteNew) =
            (amountIn - amountBase, reserveBase + amountBase, reserveQuote - amountQuote);
        }
        else {
            (amountInLeft, reserveBaseNew, reserveQuoteNew) = (amountIn, reserveBase, reserveQuote);
        }
    }

    function getFixAmountForMovePriceUp(uint _amountLeft, uint _amountAmmQuote,
        uint reserveBase, uint reserveQuote, uint targetPrice, uint priceDecimal)
    external pure returns (uint amountLeft, uint amountAmmQuote, uint amountQuoteFix) {
        uint curPrice = getPrice(reserveBase, reserveQuote, priceDecimal);
        //弥补精度损失造成的LP价格误差，将LP的价格提高一点，保证买单价格小于或等于LP价格
        //y' = x.p2 - x.p1, x不变，增加y, 使用价格变大
        if (curPrice < targetPrice) {
            amountQuoteFix = (reserveBase.mul(targetPrice).div(10 ** priceDecimal)
            .sub(reserveBase.mul(curPrice).div(10 ** priceDecimal)));
            amountQuoteFix = amountQuoteFix > 0 ? amountQuoteFix : 1;
            require(_amountLeft >= amountQuoteFix, "Hybridx OrderBook: Not Enough Output Amount");
            (amountLeft, amountAmmQuote) = (_amountLeft.sub(amountQuoteFix), _amountAmmQuote + amountQuoteFix);
        }
        else {
            (amountLeft, amountAmmQuote) = (_amountLeft, _amountAmmQuote);
        }
    }

    function getFixAmountForMovePriceDown(uint _amountLeft, uint _amountAmmBase,
        uint reserveBase, uint reserveQuote, uint targetPrice, uint priceDecimal)
    external pure returns (uint amountLeft, uint amountAmmBase, uint amountBaseFix) {
        uint curPrice = getPrice(reserveBase, reserveQuote, priceDecimal);
        //弥补精度损失造成的LP价格误差，将LP的价格降低一点，保证订单价格大于或等于LP价格
        //x' = y/p1 - y/p2, y不变，增加x，使价格变小
        if (curPrice > targetPrice) {
            amountBaseFix = (reserveQuote.mul(10 ** priceDecimal).div(targetPrice)
            .sub(reserveQuote.mul(10 ** priceDecimal).div(curPrice)));
            amountBaseFix = amountBaseFix > 0 ? amountBaseFix : 1;
            require(_amountLeft >= amountBaseFix, "Hybridx OrderBook: Not Enough Input Amount");
            (amountLeft, amountAmmBase) = (_amountLeft.sub(amountBaseFix), _amountAmmBase + amountBaseFix);
        }
        else {
            (amountLeft, amountAmmBase) = (_amountLeft, _amountAmmBase);
        }
    }

    //使用amountA数量的amountInOffer吃掉在价格price, 数量为amountOutOffer的tokenB, 返回实际消耗的tokenA数量和返回的tokenB的数量，amountOffer需要考虑手续费
    //手续费应该包含在amountOutWithFee中
    function getAmountOutForTakePrice(uint tradeDir, uint amountInOffer, uint price, uint decimal, uint orderAmount)
    external pure returns (uint amountInUsed, uint amountOutWithFee, uint communityFee) {
        uint protocolFeeRate = 30;
        uint subsidyFeeRate = 50;
        uint fee;
        if (tradeDir == OrderBookLibrary.LIMIT_BUY) { //buy (quoteToken == tokenIn, swap quote token to base token)
            //amountOut = amountInOffer / price
            uint amountOut = getBuyAmountWithPrice(amountInOffer, price, decimal);
            if (amountOut.mul(10000) <= orderAmount.mul(10000-protocolFeeRate)) { //amountOut <= orderAmount * (1-0.3%)
                amountInUsed = amountInOffer;
                fee = amountOut.mul(protocolFeeRate).div(10000);
                amountOutWithFee = amountOut + fee;
            }
            else {
                amountOut = orderAmount.mul(10000-protocolFeeRate).div(10000);
                //amountIn = amountOutWithoutFee * price
                amountInUsed = getSellAmountWithPrice(amountOut, price, decimal);
                amountOutWithFee = orderAmount;
                fee = amountOutWithFee.sub(amountOut);
            }
        }
        else if (tradeDir == OrderBookLibrary.LIMIT_SELL) { //sell (quoteToken == tokenOut, swap base token to quote token)
            //amountOut = amountInOffer * price ========= match limit buy order
            uint amountOut = getSellAmountWithPrice(amountInOffer, price, decimal);
            if (amountOut.mul(10000) <= orderAmount.mul(10000-protocolFeeRate)) { //amountOut <= orderAmount * (1-0.3%)
                amountInUsed = amountInOffer;
                fee = amountOut.mul(protocolFeeRate).div(10000);
                amountOutWithFee = amountOut + fee;
            }
            else {
                amountOut = orderAmount.mul(10000-protocolFeeRate).div(10000);
                //amountIn = amountOutWithoutFee * price
                amountInUsed = getBuyAmountWithPrice(amountOut, price, decimal);
                amountOutWithFee = orderAmount;
                fee = amountOutWithFee - amountOut;
            }
        }

        // (fee * 100 - fee * subsidyFeeRate) / 100
        communityFee = (fee.mul(100).sub(fee.mul(subsidyFeeRate))).div(100);
    }
}