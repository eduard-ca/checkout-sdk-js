import { ChargeAfter } from './chargeafter';

export default function loadChargeafterSdk(apiKey: string, cdnHost: string): Promise<ChargeAfter> {
    return new Promise((resolve) => {
        function onLoadChargeAfterSDKScript() {
            var config = {
                apiKey,
                onLoaded: () => {
                    // @ts-ignore
                    resolve(ChargeAfter);
                },
            };

            // @ts-ignore
            ChargeAfter.init(config);
        }

        var script = document.createElement('script');
        script.src = 'https://cdn' + cdnHost + '/web/v2/chargeafter.min.js?t=' + Date.now();
        script.type = 'text/javascript';
        script.async = true;
        script.onload = onLoadChargeAfterSDKScript;
        document.body.appendChild(script);
    });
}
