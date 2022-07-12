const SerialportGSM = require('serialport-gsm')
import { Subject } from 'rxjs'
const gsm7 = require('gsm7')

export type SMS = {
    sender: string
    message: string
    index: number,
    dateTimeSent: string
}

const promisify = async <T = any>(fn: (cb) => any) => {
    return await new Promise<T>((s, r) => fn(response => response.status?.toLowerCase() == 'success' ? s(response.data) : r(response.data)))
}

export class SmartGsmModem {

    public readonly $messages = new Subject<SMS>()
    public readonly $incomming_calls = new Subject<{ number: string, numberingScheme: string }>()

    private constructor(public readonly modem) {
        modem.on('onNewMessage', (sms: SMS) => this.$messages.next(sms))
        modem.on('onNewIncomingCall', result => this.$incomming_calls.next(result.data))
    }

    static async init(path: string) {
        const serialport_modem = SerialportGSM.Modem()
        const $open = new Promise<void>(s => serialport_modem.on('open', s))
        serialport_modem.open(path, {
            baudRate: 19200,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            xon: false,
            rtscts: false,
            xoff: false,
            xany: false,
            autoDeleteOnReceive: false,
            enableConcatenation: true,
            incomingCallIndication: true,
            incomingSMSIndication: true,
            onNewMessage: true,
            pin: '',
            customInitCommand: ``,
            cnmiCommand: 'AT+CNMI=2,1,0,2,1',
            // customInitCommand: `AT^CURC=0`,
            // cnmiCommand: 'AT+CNMI=3,1,0,0,1'
        })
        await $open
        await promisify(serialport_modem.initializeModem)
        const modem = new this(serialport_modem)
        await modem.excute_AT('AT+CPMS="SM","SM","SM"')
        await modem.change_mode('PDU')
        return modem
    }

    static async list_ports() {
        return await new Promise(s => SerialportGSM.list((_, response) => s(response)))
    }

    async ussd(cmd: string) {
        try {
            return await promisify(cb => this.modem.executeCommand(`AT+CUSD=1,"${cmd}",15`, cb))
        } catch (e) {
            const encoded_cmd = gsm7.encode('*101#').toString('hex').toUpperCase()
            return await promisify(cb => this.modem.executeCommand(`AT+CUSD=1,"${encoded_cmd}",15`, cb))
        }

    }

    async change_mode(mode: 'PDU' | 'SMS') {
        return await promisify(cb => this.modem.setModemMode(cb, mode))
    }

    async excute_AT(command: string) {
        return await promisify(cb => this.modem.executeCommand(command, cb))
    }

    async get_iccd() {
        const iccd = await promisify<{ result: string }>(cb => this.modem.executeCommand('AT^ICCID?', cb))
        return JSON.parse(iccd.result)
    }

    async remove_sms(sms: SMS) {
        return await promisify(cb => this.modem.deleteMessage(sms, cb))
    }

    async remove_all_sms() {
        return await promisify(this.modem.deleteAllSimMessages)
    }

    async list_messages() {
        return await promisify<Array<{
            sender: string,
            message: string
        }>>(this.modem.getSimInbox)
    }

    async send_sms(to: string, message: string, flash: boolean = false) {
        await new Promise<void>(s => {
            let i = 0
            this.modem.sendSMS(to, message, flash, () => i++ == 2 && s())
        })
    }
}