import ChargeafterScriptLoader from './chargeafter-script-loader';
import loadChargeafterSdk from './chargeafter-sdk';

jest.mock('./chargeafter-sdk');

const loadChargeafterSdkMock = loadChargeafterSdk;

describe('ChargeAfterScriptLoader', () => {
    let chargeafterScriptLoader: ChargeafterScriptLoader;

    beforeEach(() => {
        chargeafterScriptLoader = new ChargeafterScriptLoader();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('should load the script', () => {
        it('should init sbx ChargeAfter SDK', async () => {
            await chargeafterScriptLoader.load('apiKeyTest', true);

            expect(loadChargeafterSdkMock).toHaveBeenCalledWith('apiKeyTest', '-ca-dev.co');
        });

        it('should init ChargeAfter SDK', async () => {
            await chargeafterScriptLoader.load('apiKeyTest', false);

            expect(loadChargeafterSdkMock).toHaveBeenCalledWith('apiKeyTest', '.chargeafter.com');
        });
    });
});
