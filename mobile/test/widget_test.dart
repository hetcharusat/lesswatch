import 'package:flutter_test/flutter_test.dart';
import 'package:watch_together/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const WatchTogetherApp());
    expect(find.text('Watch Together'), findsOneWidget);
  });
}
