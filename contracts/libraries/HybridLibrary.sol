pragma solidity >=0.5.0;

import '@hybridx-exchange/orderbook-core/contracts/libraries/OrderBookLibrary.sol';
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBook.sol";

/**************************************************************************************************************
@title                          library for hybrid order book router
@author                         https://twitter.com/cherideal
**************************************************************************************************************/
library HybridLibrary {
    using SafeMath for uint;

    /**************************************************************************************************************
    @param orderBook               address of order book contract
    @param amountOffer             amount offered for limit order
    @param price                   price of limit order
    @param reserveBase             reserve amount of base token
    @param reserveQuote            reserve amount of quote token
    @return amounts                [amm amount in, amm amount out, order amount in, order amount out with fee,
                                    community fee, amount left, amount expert, price to]
    **************************************************************************************************************/
    function getAmountsForBuyLimitOrder(
        address orderBook,
        uint amountOffer,
        uint price,
        uint reserveBase,
        uint reserveQuote)
    internal
    view
    returns (uint[] memory amounts) {
        //get sell limit orders within a price range
        (uint[] memory priceArray, uint[] memory amountArray) =
            IOrderBook(orderBook).rangeBook(OrderBookLibrary.LIMIT_SELL, price);

        uint[] memory params = new uint[](5);
        (params[0], params[1], params[2], params[3], params[4]) = (
            IOrderBook(orderBook).baseDecimal(),
            IOrderBook(orderBook).protocolFeeRate(),
            IOrderBook(orderBook).subsidyFeeRate(),
            reserveBase,
            reserveQuote);
        amounts = new uint[](8);
        amounts[5] = amountOffer;

        //See if it is necessary to take orders
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            uint amountAmmLeft;
            //First calculate the amount in consumed from LP price to order price
            (amountAmmLeft, amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
                OrderBookLibrary.getAmountForMovePrice(
                    OrderBookLibrary.LIMIT_BUY, amounts[5], reserveBase, reserveQuote, priceArray[i], params[0]);

            //Calculate the amount of quote that will actually be consumed in amm
            amounts[0] = amountQuoteUsed;
            //Then calculate the amount of Base obtained from this moving price
            amounts[1] = amountBaseUsed;
            if (amountAmmLeft == 0) {
                amounts[5] = 0;  //avoid getAmountForMovePrice recalculation
                break;
            }

            //Calculate the amount of quote required to consume a pending order at a price
            (uint amountInForTake, uint amountOutWithFee, uint communityFee) =
                OrderBookLibrary.getAmountOutForTakePrice(
                    OrderBookLibrary.LIMIT_BUY, amountAmmLeft, priceArray[i],
                    params[0], params[1], params[2], amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee.sub(communityFee);
            amounts[4] += communityFee;
            if (amountInForTake == amountAmmLeft) {
                amounts[5] = 0; //avoid getAmountForMovePrice recalculation
                break;
            }
            amounts[5] = amounts[5].sub(amountInForTake);
        }

        if (amounts[5] > 0 && (priceArray.length == 0 || price > priceArray[priceArray.length-1])) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            (amounts[5], amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
                OrderBookLibrary.getAmountForMovePrice(
                    OrderBookLibrary.LIMIT_BUY, amounts[5], reserveBase, reserveQuote, price, params[0]);
            amounts[0] = amountQuoteUsed;
            amounts[1] = amountBaseUsed;
        }

        if (amounts[1] > 0 && amounts[5] > 0) {
            uint amountQuoteFix;
            (amounts[5], amounts[0], amountQuoteFix) =
                OrderBookLibrary.getFixAmountForMovePriceUp(amounts[5], amounts[0], params[3], params[4],
                    price, params[0]);
            amounts[7] = OrderBookLibrary.getPrice(params[3], params[4] + amountQuoteFix, params[0]);
        }
        else {
            amounts[7] = OrderBookLibrary.getPrice(params[3], params[4], params[0]);
        }

        amounts[6] = amounts[5].mul(10000-params[1]).mul(10 ** params[0]).div(price).div(10000);
    }

    /**************************************************************************************************************
    @param orderBook               address of order book contract
    @param amountOffer             amount offered for limit order
    @param price                   price of limit order
    @param reserveBase             reserve amount of base token
    @param reserveQuote            reserve amount of quote token
    @return amounts                [amm amount in, amm amount out, order amount in, order amount out with fee,
                                    community fee, amount left, amount expect, price to]
    **************************************************************************************************************/
    function getAmountsForSellLimitOrder(
        address orderBook,
        uint amountOffer,
        uint price,
        uint reserveBase,
        uint reserveQuote)
    internal
    view
    returns (uint[] memory amounts) {
        //get buy limit orders within a price range
        (uint[] memory priceArray, uint[] memory amountArray) =
            IOrderBook(orderBook).rangeBook(OrderBookLibrary.LIMIT_BUY, price);
        uint[] memory params = new uint[](5);
        (params[0], params[1], params[2], params[3], params[4]) = (
            IOrderBook(orderBook).baseDecimal(),
            IOrderBook(orderBook).protocolFeeRate(), //considered get multiple parameters by one interface
            IOrderBook(orderBook).subsidyFeeRate(),
            reserveBase,
            reserveQuote);
        amounts = new uint[](8);
        amounts[5] = amountOffer;

        //See if it is necessary to take orders
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            uint amountAmmLeft;
            //First calculate the amount in consumed from LP price to order price
            (amountAmmLeft, amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
                OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, amounts[5], reserveBase, reserveQuote, priceArray[i], params[0]);
            amounts[0] = amountBaseUsed;
            amounts[1] = amountQuoteUsed;
            if (amountAmmLeft == 0) {
                amounts[5] = 0;  //avoid getAmountForMovePrice recalculation
                break;
            }

            //Calculate the amount of base required to consume a pending order at a price
            (uint amountInForTake, uint amountOutWithFee, uint communityFee) =
                OrderBookLibrary.getAmountOutForTakePrice(
                    OrderBookLibrary.LIMIT_SELL, amountAmmLeft, priceArray[i],
                        params[0], params[1], params[2], amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee.sub(communityFee);
            amounts[4] += communityFee;
            if (amountInForTake == amountAmmLeft) {
                amounts[5] = 0; //avoid getAmountForMovePrice recalculation
                break;
            }
            amounts[5] = amounts[5].sub(amountInForTake);
        }

        if (amounts[5] > 0 && (priceArray.length == 0 || price < priceArray[priceArray.length-1])){
            uint amountBaseUsed;
            uint amountQuoteUsed;
            (amounts[5], amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
            OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, amounts[5], reserveBase, reserveQuote, price, params[0]);
            amounts[0] = amountBaseUsed;
            amounts[1] = amountQuoteUsed;
        }

        if (amounts[0] > 0 && amounts[5] > 0) {
            uint amountBaseFix;
            (amounts[5], amounts[0], amountBaseFix) =
            OrderBookLibrary.getFixAmountForMovePriceDown(amounts[5], amounts[0], params[3], params[4],
                price, params[0]);
            amounts[7] = OrderBookLibrary.getPrice(params[3] + amountBaseFix, params[4], params[0]);
        }
        else {
            amounts[7] = OrderBookLibrary.getPrice(params[3], params[4], params[0]);
        }

        amounts[6] = amounts[5].mul(10000-params[1]).mul(price).div(10000).div(10 ** params[0]);
    }
}
