import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'

import { expandTo18Decimals, mineBlock, encodePrice, printOrder } from './shared/utilities'
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

  it('getAmountOutForMovePrice down:start price > buy limit order price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    console.log("price before:", (await orderBook.getPrice()).toString())
    const minAmount = await orderBook.minAmount()
    console.log("minAmount:", minAmount.toString())

    let limitAmount = expandTo18Decimals(1)
    console.log("limitAmount:", limitAmount.toString())

    await tokenQuote.transfer(orderBook.address, limitAmount)
    await orderBook.createBuyLimitOrder(wallet.address, expandTo18Decimals(1), wallet.address)

    let order = await orderBook.marketOrders(1);
    printOrder(order)
    console.log("user orders:", await orderBook.getUserOrders(wallet.address))
    console.log("price after:", (await orderBook.getPrice()).toString())

    let reserves = await orderBook.getReserves()
    console.log("reserve base:", reserves[0].toString())
    console.log("reserve quote:", reserves[1].toString())

    let amountOffer = bigNumberify("1000000000000000000")
    let price = bigNumberify("1000000000000000000")
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("order fee:", results[4].toString())
    console.log("order amount left:", results[5].toString())
    console.log("price to:", results[6].toString())

    amountOffer = bigNumberify("1000000000000000000")
    price = bigNumberify("1000000000000000000")
    results = await hybridRouter.getAmountsForSell(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("order fee:", results[4].toString())
    console.log("order amount left:", results[5].toString())
    console.log("price to:", results[6].toString())
    console.log("price after:", (reserves[1].sub(results[1])).mul(bigNumberify("1000000000000000000")).div(reserves[0].add(results[0])).toString())
  })

  //实际情况不存在start price < buy limit order price的情况
})
