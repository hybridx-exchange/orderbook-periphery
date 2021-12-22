/**
 *Submitted for verification at Etherscan.io on 2020-06-05
*/

pragma solidity =0.6.6;

import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import '@hybridx-exchange/orderbook-core/contracts/libraries/OrderBookLibrary.sol';
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IWETH.sol";
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBook.sol";
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBookFactory.sol";
import "./interfaces/IHybridRouter.sol";
import "./libraries/HybridLibrary.sol";

contract HybridRouter is IHybridRouter {
    address public immutable override factory;
    address public immutable override WETH;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'HybridRouter: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    //创建用quoteToken买baseToken限价单 (usdc -> uni)
    function buyWithToken(
        uint amountOffer,
        uint price,
        address tokenA,
        address tokenB,
        address to,
        uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint orderId) {
        require(tokenA != tokenB, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(tokenA, tokenB);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        address quoteToken = tokenA == IOrderBook(orderBook).baseToken() ? tokenB : tokenA;

        TransferHelper.safeTransferFrom(
            quoteToken, msg.sender, orderBook, amountOffer
        );

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createBuyLimitOrder(msg.sender, price, to);
    }

    //创建用ETH买BaseToken限价单 (eth -> uni)
    function buyWithEth(
        uint price,
        address tokenA,
        address to,
        uint deadline)
        external
        virtual
        payable
        override
        ensure(deadline)
        returns (uint orderId)
    {
        require(tokenA != WETH, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(tokenA, WETH);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(IOrderBook(orderBook).quoteToken() == WETH, 'HybirdRouter: Invalid_Token');

        //挂单不能将eth存放在router下面，需要存在order book上，不然订单成交时没有资金来源
        IWETH(WETH).deposit{value: msg.value}();
        assert(IWETH(WETH).transfer(orderBook, msg.value));

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createBuyLimitOrder(msg.sender, price, to);
    }

    //创建将baseToken卖为quoteToken限价单 (uni -> usdc)
    function sellToken(
        uint amountOffer,
        uint price,
        address tokenA,
        address tokenB,
        address to,
        uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint orderId)
    {
        require(tokenA != tokenB, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(tokenA, tokenB);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        address baseToken = tokenA == IOrderBook(orderBook).baseToken() ? tokenA : tokenB;

        TransferHelper.safeTransferFrom(
            baseToken, msg.sender, orderBook, amountOffer
        );

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createSellLimitOrder(msg.sender, price, to);
    }

    //创建将ETH卖为quoteToken限价单 (eth -> usdc)
    function sellEth(
        uint price,
        address tokenB,
        address to,
        uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint orderId)
    {
        require(WETH != tokenB, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(WETH, tokenB);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(WETH == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        //挂单不能将eth存放在router下面，需要存在order book上，不然订单成交时没有资金来源
        IWETH(WETH).deposit{value: msg.value}();
        assert(IWETH(WETH).transfer(orderBook, msg.value));

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createSellLimitOrder(msg.sender, price, to);
    }

    //需要考虑初始价格到目标价格之间还有其它挂单的情况，需要考虑最小数量
    function getAmountsForBuy(uint amountOffer, uint price, address tokenA, address tokenB)
    external
    virtual
    override
    view
    returns (uint[] memory amounts) { //返回ammAmountIn, ammAmountOut, orderAmountIn, orderAmountOut, fee
        require(tokenA != tokenB, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(tokenA, tokenB);
        if (orderBook != address(0)) {
            (address baseToken, address quoteToken) = IOrderBook(orderBook).baseToken() == tokenA ?
                (tokenA, tokenB) : (tokenB, tokenA);
            (uint reserveBase, uint reserveQuote) = OrderBookLibrary.getReserves(
                IOrderBook(orderBook).pair(),
                baseToken,
                quoteToken);
            amounts = HybridLibrary.getAmountsForBuyLimitOrder(orderBook, amountOffer, price, reserveBase, reserveQuote);
        }
    }

    //需要考虑初始价格到目标价格之间还有其它挂单的情况，需要考虑最小数量
    function getAmountsForSell(uint amountOffer, uint price, address tokenA, address tokenB)
    external
    virtual
    override
    view
    returns (uint[] memory amounts) { //返回ammAmountIn, ammAmountOut, orderAmountIn, orderAmountOut
        require(tokenA != tokenB, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(tokenA, tokenB);
        if (orderBook != address(0)) {
            (address baseToken, address quoteToken) = IOrderBook(orderBook).baseToken() == tokenA ?
                (tokenA, tokenB) : (tokenB, tokenA);
                (uint reserveBase, uint reserveQuote) = OrderBookLibrary.getReserves(
                IOrderBook(orderBook).pair(),
                baseToken,
                quoteToken);
            amounts = HybridLibrary.getAmountsForSellLimitOrder(orderBook, amountOffer, price, reserveBase, reserveQuote);
        }
    }

    //获取订单薄
    function getOrderBook(address tokenA, address tokenB, uint32 limitSize)
    external
    virtual
    override
    view
    returns
    (uint price, uint[] memory buyPrices, uint[] memory buyAmounts, uint[] memory sellPrices, uint[] memory sellAmounts)
    {
        require(tokenA != tokenB, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(tokenA, tokenB);
        if (orderBook != address(0)) {
            price = IOrderBook(orderBook).getPrice();
            (buyPrices, buyAmounts) = IOrderBook(orderBook).marketBook(OrderBookLibrary.LIMIT_BUY, limitSize);
            (sellPrices, sellAmounts) = IOrderBook(orderBook).marketBook(OrderBookLibrary.LIMIT_SELL, limitSize);
        }
    }
}
