# Lighthouse YAML compatibility

`@lhci/utils@0.15.1` still requires js-yaml 3, whose argparse dependency pulls
in sprintf-js. sprintf-js has no fixed release for GHSA-hp3w-g68c-fv3c.

The root override upgrades js-yaml 3 consumers to js-yaml 4.3.2. The patch
changes Lighthouse's `safeLoad` call to `load`, the equivalent safe API in
js-yaml 4 (unsafe JavaScript YAML types are no longer supported).

Remove the patch when Lighthouse CI supports js-yaml 4 or later itself.
