import 'package:flutter/material.dart';

void main() => runApp(const NoodleApp());

class NoodleApp extends StatelessWidget {
  const NoodleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true).copyWith(scaffoldBackgroundColor: Colors.black),
      home: const CounterPage(),
    );
  }
}

class CounterPage extends StatefulWidget {
  const CounterPage({super.key});

  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int count = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$count', style: const TextStyle(fontSize: 96, fontWeight: FontWeight.w200)),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(onPressed: () => setState(() => count--), child: const Text('−', style: TextStyle(fontSize: 28))),
                const SizedBox(width: 16),
                OutlinedButton(onPressed: () => setState(() => count++), child: const Text('+', style: TextStyle(fontSize: 28))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
