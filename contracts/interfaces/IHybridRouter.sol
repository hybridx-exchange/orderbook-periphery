pragma solidity >=0.6.2;

interface IHybridRouter {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);

    //创建token买token限价单
    function buyWithToken(
        uint amountOffer,
        uint price,
        address tokenA,
        address tokenB,
        address to,
        uint deadline)
        external
        returns (uint);

    //创建eth买token限价单
    function buyWithEth(
        uint price,
        address tokenA,
        address to,
        uint deadline)
        external
        payable
        returns (uint);

    //创建token卖为token限价单
    function sellToken(
        uint amountOffer,
        uint price,
        address tokenA,
        address tokenB,
        address to,
        uint deadline)
        external
        returns (uint);

    //创建eth卖为token限价单
    function sellEth(
        uint price,
        address tokenB
        address to,
        uint deadline)
        external
        payable
        returns (uint);

    function getAmountsForBuy(
        uint amountOffer,
        uint price,
        address tokenA,
        address tokenB)
    external view
    returns (uint[] memory amounts);

    function getAmountsForSell(
        uint amountOffer,
        uint price,
        address tokenA,
        address tokenB)
    external view
    returns (uint[] memory amounts);

    function getOrderBook(
        address tokenA,
        address tokenB,
        uint32 limitSize)
    external view
    returns
    (uint price, uint[] memory buyPrices, uint[] memory buyAmounts, uint[] memory sellPrices, uint[] memory
        sellAmounts);
}
