import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { MaxUint256 } from 'ethers/constants'
import {expandTo18Decimals, mineBlock, encodePrice, printOrder, printOrder2} from './shared/utilities'
import { orderBookFixture } from './shared/fixtures'
import { AddressZero } from 'ethers/constants'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
  gasLimit: 99999999
}

describe('HybridxOrderBook', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 999999999
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let factory: Contract
  let token0: Contract
  let token1: Contract
  let pair: Contract
  let orderBook: Contract
  let orderBookFactory: Contract
  let hybridRouter: Contract
  let tokenBase: Contract
  let tokenQuote: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(orderBookFixture)
    factory = fixture.factory
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    orderBook = fixture.orderBook
    orderBookFactory = fixture.orderBookFactory
    hybridRouter = fixture.router
    tokenBase = fixture.tokenA
    tokenQuote = fixture.tokenB
  })

  afterEach(async function() {
    expect(await provider.getBalance(hybridRouter.address)).to.eq(0)
  })

  it('buyWithToken: buy limit price <= start price == end price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    const minAmount = await orderBook.minAmount()
    expect(minAmount).to.eq(bigNumberify("1000"))
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    let limitPrice = expandTo18Decimals(1)
    let direction = bigNumberify(1)
    await tokenQuote.approve(hybridRouter.address, MaxUint256)

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)

    let order2 = await orderBook.marketOrder(1)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    let quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    limitPrice = expandTo18Decimals(2)
    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)
    order = await orderBook.marketOrders(2);
    expect(order.amountRemain).to.eq(limitAmount)

    order2 = await orderBook.marketOrder(2)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount.add(limitAmount))

    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1"), bigNumberify("2")])
    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
        currentPrice,
        [expandTo18Decimals(2), expandTo18Decimals(1)],
        [limitAmount, limitAmount],
        [],
        []
    ])
  })

  it('buyWithToken: start price < end price <= buy limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    const minAmount = await orderBook.minAmount()
    expect(minAmount).to.eq(bigNumberify("1000"))
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    let decimal = bigNumberify(18)
    let limitPrice = expandTo18Decimals(2)
    let direction = bigNumberify(1)
    await tokenQuote.approve(hybridRouter.address, MaxUint256)

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)

    let order2 = await orderBook.marketOrder(1)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    let quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    expect(currentPrice).to.eq(limitPrice)

    let reserves = await orderBook.getReserves()
    let expectOutputAmount = await hybridRouter.getAmountOut(limitAmount, reserves[1], reserves[0])

    limitPrice = expandTo18Decimals(3)
    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(tokenQuote, "Transfer").withArgs(orderBook.address, pair.address, limitAmount)
        .to.emit(tokenBase, "Transfer").withArgs(pair.address, wallet.address, expectOutputAmount)

    quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    currentPrice = await hybridRouter.getPrice(reserves[0].sub(expectOutputAmount), reserves[1].add(limitAmount), decimal)

    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1")])
    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
      currentPrice,
      [expandTo18Decimals(2)],
      [limitAmount],
      [],
      []
    ])
  })

  /*it('getAmountsForBuy: match sell limit order, price == current price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let limitPrice = expandTo18Decimals(2)
    let decimalAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    //console.log("current price:", currentPrice.toString())

    await tokenBase.transfer(orderBook.address, limitAmount)
    await orderBook.createSellLimitOrder(wallet.address, limitPrice, wallet.address, overrides)

    let order = await orderBook.marketOrders(1);
    //printOrder(order)
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    //console.log("reserve base:", reserves[0].toString())
    //console.log("reserve quote:", reserves[1].toString())
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("1000000000000000000")
    let price = expandTo18Decimals(2)
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())
    expect(results[0]).to.eq(bigNumberify("0"))
    expect(results[1]).to.eq(bigNumberify("0"))
    expect(results[2]).to.eq(amountOffer)
    expect(results[3]).to.eq(amountOffer.mul(decimalAmount).div(price).add(results[4]))
    expect(results[4]).to.eq(amountOffer.mul(decimalAmount).div(price).mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]))
    expect(results[6]).to.eq(price)

    amountOffer = bigNumberify("10000000000000000000")
    price = expandTo18Decimals(2)
    results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())
    expect(results[0]).to.eq(bigNumberify("0"))
    expect(results[1]).to.eq(bigNumberify("0"))
    expect(results[2]).to.eq(limitAmount.mul(bigNumberify(997)).div(bigNumberify(1000)).mul(limitPrice).div(decimalAmount))
    expect(results[3]).to.eq(limitAmount)
    expect(results[4]).to.eq(limitAmount.mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]))
    expect(results[6]).to.eq(price)
  })

  it('getAmountsForBuy: match sell limit order, price > current price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let limitPrice = expandTo18Decimals(2)
    let decimalAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    //console.log("current price:", currentPrice.toString())

    await tokenBase.transfer(orderBook.address, limitAmount)
    await orderBook.createSellLimitOrder(wallet.address, limitPrice, wallet.address, overrides)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("10000000000000000000")
    let price = expandTo18Decimals(3)
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())
    expect(results[0]).to.eq(bigNumberify("2250825417403555361"))
    expect(results[1]).to.eq(bigNumberify("916391527532148214"))
    expect(results[2]).to.eq(limitAmount.mul(bigNumberify(997)).div(bigNumberify(1000)).mul(limitPrice).div(decimalAmount))
    expect(results[3]).to.eq(limitAmount)
    expect(results[4]).to.eq(limitAmount.mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]).sub(results[0]))
    expect(results[6]).to.eq(price)
    expect(results[6]).to.eq((reserves[1].add(results[0])).mul(decimalAmount).div(reserves[0].sub(results[1])))
  })

  it('getAmountsForBuy: match all sell limit orders, price > max sell limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let limitPrices = [
      expandTo18Decimals(2),
      bigNumberify("2100000000000000000"),
      bigNumberify("2200000000000000000"),
      bigNumberify("2300000000000000000"),
      bigNumberify("2400000000000000000"),
      bigNumberify("2500000000000000000"),
      bigNumberify("2600000000000000000"),
      bigNumberify("2700000000000000000"),
      bigNumberify("2800000000000000000")]
    let decimalAmount = expandTo18Decimals(1)
    let decimal = bigNumberify(18)
    let currentPrice = await orderBook.getPrice()
    //console.log("current price:", currentPrice.toString())

    for (let i=0; i<limitPrices.length; i++) {
      await tokenBase.transfer(orderBook.address, limitAmount)
      await orderBook.createSellLimitOrder(wallet.address, limitPrices[i], wallet.address, overrides)
    }

    let order = await orderBook.marketOrders(1);
    //printOrder(order)
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq
    (
        [bigNumberify("1"),
          bigNumberify("2"),
          bigNumberify("3"),
          bigNumberify("4"),
          bigNumberify("5"),
          bigNumberify("6"),
          bigNumberify("7"),
          bigNumberify("8"),
          bigNumberify("9")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("30000000000000000000")
    let price = expandTo18Decimals(3)

    let amountBase = bigNumberify(0)
    let amountQuote = bigNumberify(0)
    let reserves2 = await orderBook.getReserves()
    let amountLeft = amountOffer
    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    for (let i=0; i<limitPrices.length; i++) {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountLeft, reserves2[0], reserves2[1], limitPrices[i], decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("amm amount in:", results[1].toString())
      //console.log("amm amount out:", results[2].toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
      amountLeft = results[0]
      amountBase = amountBase.add(results[1])
      amountQuote = amountQuote.add(results[2])
      reserves2[0] = results[3]
      reserves2[1] = results[4]
      results = await hybridRouter.getAmountOutForTakePrice(bigNumberify(1), amountLeft, limitPrices[i], decimal, limitAmount)
      //console.log("amount in used:", results[0].toString())
      if (amountLeft.gt(results[0])){
        amountLeft = amountLeft.sub(results[0])
      } else {
        amountLeft = bigNumberify(0)
        break
      }
      //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++")
    }

    {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountLeft, reserves2[0], reserves2[1], price, decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("amm amount in:", results[1].toString())
      //console.log("amm amount out:", results[2].toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
      amountBase = amountBase.add(results[1])
      amountQuote = amountQuote.add(results[2])
      //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++")
    }

    //console.log("total amount quote:", amountQuote.toString())
    //console.log("total amount base:", amountBase.toString())
    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountOffer, reserves[0], reserves[1], price, decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("single amm amount in:", results[2].toString())
      //console.log("single amm amount out:", results[1].toString())
      //console.log("single price:", ((reserves[1].add(results[2])).mul(decimalAmount).div(reserves[0].sub(results[1]))).toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
    }

    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())

    let orderAmounts: BigNumber = bigNumberify(0);
    for (let i=0; i<limitPrices.length; i++) {
      orderAmounts = orderAmounts.add(limitAmount.mul(bigNumberify(997)).div(bigNumberify(1000)).mul(limitPrices[i]).div(decimalAmount))
    }

    //expect(results[0]).to.eq(bigNumberify("2250825417403555361"))
    //expect(results[1]).to.eq(bigNumberify("916391527532148214"))
    expect(results[2]).to.eq(orderAmounts)
    expect(results[3]).to.eq(limitAmount.mul(bigNumberify(9)))
    expect(results[4]).to.eq(limitAmount.mul(bigNumberify(9)).mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]).sub(results[0]))
    expect(results[6]).to.eq(price)
    expect(results[6]).to.eq((reserves[1].add(results[0])).mul(decimalAmount).div(reserves[0].sub(results[1])))
    expect(reserves[1].mul(reserves[0])).to.lte((reserves[1].add(results[0])).mul(reserves[0].sub(results[1])))
  })

  it('getAmountsForBuy: match all sell limit orders, price == max sell limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let limitPrices = [
      expandTo18Decimals(2),
      bigNumberify("2100000000000000000"),
      bigNumberify("2200000000000000000"),
      bigNumberify("2300000000000000000"),
      bigNumberify("2400000000000000000"),
      bigNumberify("2500000000000000000"),
      bigNumberify("2600000000000000000"),
      bigNumberify("2700000000000000000"),
      bigNumberify("2800000000000000000"),
      bigNumberify("2900000000000000000"),
      bigNumberify("3000000000000000000")]
    let decimalAmount = expandTo18Decimals(1)
    let decimal = bigNumberify(18)
    let currentPrice = await orderBook.getPrice()
    //console.log("current price:", currentPrice.toString())

    for (let i=0; i<limitPrices.length; i++) {
      await tokenBase.transfer(orderBook.address, limitAmount)
      await orderBook.createSellLimitOrder(wallet.address, limitPrices[i], wallet.address, overrides)
    }

    let order = await orderBook.marketOrders(1);
    //printOrder(order)
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq
    (
        [bigNumberify("1"),
          bigNumberify("2"),
          bigNumberify("3"),
          bigNumberify("4"),
          bigNumberify("5"),
          bigNumberify("6"),
          bigNumberify("7"),
          bigNumberify("8"),
          bigNumberify("9"),
          bigNumberify("10"),
          bigNumberify("11")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("30000000000000000000")
    let price = expandTo18Decimals(3)

    let amountBase = bigNumberify(0)
    let amountQuote = bigNumberify(0)
    let reserves2 = await orderBook.getReserves()
    let amountLeft = amountOffer
    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    for (let i=0; i<limitPrices.length; i++) {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountLeft, reserves2[0], reserves2[1], limitPrices[i], decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("amm amount in:", results[1].toString())
      //console.log("amm amount out:", results[2].toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
      amountLeft = results[0]
      amountBase = amountBase.add(results[1])
      amountQuote = amountQuote.add(results[2])
      reserves2[0] = results[3]
      reserves2[1] = results[4]
      results = await hybridRouter.getAmountOutForTakePrice(bigNumberify(1), amountLeft, limitPrices[i], decimal, limitAmount)
      //console.log("amount in used:", results[0].toString())
      if (amountLeft.gt(results[0])){
        amountLeft = amountLeft.sub(results[0])
      } else {
        amountLeft = bigNumberify(0)
        break
      }
      //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++")
    }

    {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountLeft, reserves2[0], reserves2[1], price, decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("amm amount in:", results[1].toString())
      //console.log("amm amount out:", results[2].toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
      amountBase = amountBase.add(results[1])
      amountQuote = amountQuote.add(results[2])
      //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++")
    }

    //console.log("total amount quote:", amountQuote.toString())
    //console.log("total amount base:", amountBase.toString())
    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountOffer, reserves[0], reserves[1], price, decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("single amm amount in:", results[2].toString())
      //console.log("single amm amount out:", results[1].toString())
      //console.log("single price:",
      // ((reserves[1].add(results[2])).mul(decimalAmount).div(reserves[0].sub(results[1]))).toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
    }

    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())

    let orderAmounts: BigNumber = bigNumberify(0);
    for (let i=0; i<limitPrices.length; i++) {
      orderAmounts = orderAmounts.add(limitAmount.mul(bigNumberify(997)).div(bigNumberify(1000)).mul(limitPrices[i]).div(decimalAmount))
    }

    //expect(results[0]).to.eq(bigNumberify("2250825417403555361"))
    //expect(results[1]).to.eq(bigNumberify("916391527532148214"))
    expect(results[2]).to.eq(orderAmounts)
    expect(results[3]).to.eq(limitAmount.mul(bigNumberify(11)))
    expect(results[4]).to.eq(limitAmount.mul(bigNumberify(11)).mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]).sub(results[0]))
    expect(results[6]).to.eq(price)
    expect(results[6]).to.eq((reserves[1].add(results[0])).mul(decimalAmount).div(reserves[0].sub(results[1])))
    expect(reserves[1].mul(reserves[0])).to.lte((reserves[1].add(results[0])).mul(reserves[0].sub(results[1])))
  })

  it('getAmountsForBuy: match partly sell limit orders, price > end price > one of sell limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let limitPrices = [
      expandTo18Decimals(2),
      bigNumberify("2100000000000000000"),
      bigNumberify("2200000000000000000"),
      bigNumberify("2300000000000000000"),
      bigNumberify("2400000000000000000"),
      bigNumberify("2500000000000000000"),
      bigNumberify("2600000000000000000"),
      bigNumberify("2700000000000000000"),
      bigNumberify("2800000000000000000")]
    let decimalAmount = expandTo18Decimals(1)
    let decimal = bigNumberify(18)
    let currentPrice = await orderBook.getPrice()
    //console.log("current price:", currentPrice.toString())

    for (let i=0; i<limitPrices.length; i++) {
      await tokenBase.transfer(orderBook.address, limitAmount)
      await orderBook.createSellLimitOrder(wallet.address, limitPrices[i], wallet.address, overrides)
    }

    let order = await orderBook.marketOrders(1);
    //printOrder(order)
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq
    (
        [bigNumberify("1"),
          bigNumberify("2"),
          bigNumberify("3"),
          bigNumberify("4"),
          bigNumberify("5"),
          bigNumberify("6"),
          bigNumberify("7"),
          bigNumberify("8"),
          bigNumberify("9")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("17550000000000000000")
    let price = expandTo18Decimals(3)

    let amountBase = bigNumberify(0)
    let amountQuote = bigNumberify(0)
    let reserves2 = await orderBook.getReserves()
    let amountLeft = amountOffer
    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    for (let i=0; i<limitPrices.length; i++) {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountLeft, reserves2[0], reserves2[1], limitPrices[i], decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("amm amount in:", results[1].toString())
      //console.log("amm amount out:", results[2].toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
      //需要去掉用于吃单的数量
      amountLeft = results[0]
      amountBase = amountBase.add(results[1])
      amountQuote = amountQuote.add(results[2])
      reserves2[0] = results[3]
      reserves2[1] = results[4]
      //console.log("price:", ((reserves2[1]).mul(decimalAmount).div(reserves2[0])).toString())
      results = await hybridRouter.getAmountOutForTakePrice(bigNumberify(1), amountLeft, limitPrices[i], decimal, limitAmount)
      //console.log("amount in used:", results[0].toString())
      if (amountLeft.gt(results[0])){
        amountLeft = amountLeft.sub(results[0])
      } else {
        amountLeft = bigNumberify(0)
        break
      }
      //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++")
    }

    //console.log("total amount quote:", amountQuote.toString())
    //console.log("total amount base:", amountBase.toString())
    //console.log("total amount left:", amountLeft.toString())

    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())

    let orderAmounts: BigNumber = bigNumberify(0);
    for (let i=0; i<7; i++) {
      orderAmounts = orderAmounts.add(limitAmount.mul(bigNumberify(997)).div(bigNumberify(1000)).mul(limitPrices[i]).div(decimalAmount))
    }

    //expect(results[0]).to.eq(bigNumberify("2250825417403555361"))
    //expect(results[1]).to.eq(bigNumberify("916391527532148214"))
    expect(results[2]).to.eq(orderAmounts)
    expect(results[3]).to.eq(limitAmount.mul(bigNumberify(7)))
    expect(results[4]).to.eq(limitAmount.mul(bigNumberify(7)).mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]).sub(results[0]))
    expect(results[6]).to.gt(limitPrices[6])
    expect(results[6]).to.lt(limitPrices[7])
    expect(results[6]).to.eq((reserves[1].add(results[0])).mul(decimalAmount).div(reserves[0].sub(results[1])))
    expect(reserves[1].mul(reserves[0])).to.lte((reserves[1].add(results[0])).mul(reserves[0].sub(results[1])))
  })

  it('getAmountsForBuy: match partly sell limit orders, price > end price == one of sell limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let limitPrices = [
      expandTo18Decimals(2),
      bigNumberify("2100000000000000000"),
      bigNumberify("2200000000000000000"),
      bigNumberify("2300000000000000000"),
      bigNumberify("2400000000000000000"),
      bigNumberify("2500000000000000000"),
      bigNumberify("2600000000000000000"),
      bigNumberify("2700000000000000000"),
      bigNumberify("2800000000000000000")]
    let decimalAmount = expandTo18Decimals(1)
    let decimal = bigNumberify(18)
    let currentPrice = await orderBook.getPrice()
    //console.log("current price:", currentPrice.toString())

    for (let i=0; i<limitPrices.length; i++) {
      await tokenBase.transfer(orderBook.address, limitAmount)
      await orderBook.createSellLimitOrder(wallet.address, limitPrices[i], wallet.address, overrides)
    }

    let order = await orderBook.marketOrders(1);
    //printOrder(order)
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq
    (
        [bigNumberify("1"),
          bigNumberify("2"),
          bigNumberify("3"),
          bigNumberify("4"),
          bigNumberify("5"),
          bigNumberify("6"),
          bigNumberify("7"),
          bigNumberify("8"),
          bigNumberify("9")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("18000000000000000000")
    let price = expandTo18Decimals(3)

    let amountBase = bigNumberify(0)
    let amountQuote = bigNumberify(0)
    let reserves2 = await orderBook.getReserves()
    let amountLeft = amountOffer
    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    for (let i=0; i<limitPrices.length; i++) {
      let results = await hybridRouter.getAmountForMovePrice(bigNumberify(1), amountLeft, reserves2[0], reserves2[1], limitPrices[i], decimal)
      //console.log("amount left:", results[0].toString())
      //console.log("amm amount in:", results[1].toString())
      //console.log("amm amount out:", results[2].toString())
      //console.log("reserve base:", results[3].toString())
      //console.log("reserve quote:", results[4].toString())
      //需要去掉用于吃单的数量
      amountLeft = results[0]
      amountBase = amountBase.add(results[1])
      amountQuote = amountQuote.add(results[2])
      reserves2[0] = results[3]
      reserves2[1] = results[4]
      //console.log("price:", ((reserves2[1]).mul(decimalAmount).div(reserves2[0])).toString())
      results = await hybridRouter.getAmountOutForTakePrice(bigNumberify(1), amountLeft, limitPrices[i], decimal, limitAmount)
      //console.log("amount in used:", results[0].toString())
      if (amountLeft.gt(results[0])){
        amountLeft = amountLeft.sub(results[0])
      } else {
        amountLeft = bigNumberify(0)
        break
      }
      //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++")
    }

    //console.log("total amount quote:", amountQuote.toString())
    //console.log("total amount base:", amountBase.toString())
    //console.log("total amount left:", amountLeft.toString())

    //console.log("----------------------------------------------------------------------------------------------------------------------------")
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    //console.log("amm amount in:", results[0].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("order amount in:", results[2].toString())
    //console.log("order amount out:", results[3].toString())
    //console.log("fee from order matching:", results[4].toString())
    //console.log("amount left:", results[5].toString())
    //console.log("price to:", results[6].toString())

    let orderAmounts: BigNumber = bigNumberify(0);
    for (let i=0; i<7; i++) {
      orderAmounts = orderAmounts.add(limitAmount.mul(bigNumberify(997)).div(bigNumberify(1000)).mul(limitPrices[i]).div(decimalAmount))
    }

    //expect(results[0]).to.eq(bigNumberify("2250825417403555361"))
    //expect(results[1]).to.eq(bigNumberify("916391527532148214"))
    expect(results[2]).to.gt(orderAmounts)
    expect(results[3]).to.gt(limitAmount.mul(bigNumberify(7)))
    expect(results[4]).to.gt(limitAmount.mul(bigNumberify(7)).mul(bigNumberify(3)).div(bigNumberify(1000)))
    expect(results[5]).to.eq(amountOffer.sub(results[2]).sub(results[0]))
    expect(results[6]).to.lte(limitPrices[7])
    expect(results[6]).to.eq((reserves[1].add(results[0])).mul(decimalAmount).div(reserves[0].sub(results[1])))
    expect(reserves[1].mul(reserves[0])).to.lte((reserves[1].add(results[0])).mul(reserves[0].sub(results[1])))
  })*/
})
