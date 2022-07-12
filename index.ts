import { SmartGsmModem } from './SmartGsmModem'
const gsm7 = require('gsm7')

setTimeout(async () => {
    console.log('Started')
    const modem = await SmartGsmModem.init('COM5')
})