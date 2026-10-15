// Do not print failed assertions, request URLs or bearer capabilities.
export default class SafeReporter {
  onTestEnd(test, result) {
    console.log(JSON.stringify({ browser: test.parent.project().name, test: test.title, status: result.status }));
    // This separate worker test contains no capabilities or operational fixtures.
    if (test.title.startsWith('root worker') && result.status !== 'passed') {
      console.log(JSON.stringify({ workerFailure: result.errors.map(error => error.message) }));
    }
  }
  onEnd(result) { console.log(JSON.stringify({ suite: 'node22-runtime-integration', status: result.status })); }
}
