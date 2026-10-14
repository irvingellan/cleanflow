export default class SafeReporter {
  onTestEnd(test, result) { console.log(JSON.stringify({ browser: test.parent.project().name, test: test.title, status: result.status })); }
  onEnd(result) { console.log(JSON.stringify({ suite: 'actual-multi-photo-integration', status: result.status })); }
}
