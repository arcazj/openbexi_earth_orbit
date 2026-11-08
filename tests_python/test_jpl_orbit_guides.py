import unittest
from datetime import datetime, timedelta, timezone
from tools.generate_jpl_orbit_guides import request_spans, hermite_position, stamp


class OrbitGuideGeneratorTests(unittest.TestCase):
    def test_long_neptune_coverage_uses_aligned_bounded_chunks(self):
        start = datetime(1896, 5, 28, tzinfo=timezone.utc)
        stop = start + timedelta(days=96000)
        spans = list(request_spans(start, stop, 8))
        self.assertEqual(len(spans), 3)
        self.assertEqual(spans[0][0], start)
        self.assertEqual(spans[-1][1], stop)
        for index, (lo, hi) in enumerate(spans):
            self.assertLessEqual((hi-lo).days, 36525)
            self.assertEqual((hi-lo).days % 8, 0)
            if index:
                self.assertEqual(spans[index-1][1], lo)

    def test_reference_interpolation_reproduces_cubic_motion(self):
        start = datetime(2020, 1, 1, tzinfo=timezone.utc)
        end = start + timedelta(seconds=10)
        left = {'dateUtc': stamp(start), 'vector': [0, 0, 0, 0, 0, 0]}
        right = {'dateUtc': stamp(end), 'vector': [1000, 2000, -1000, 300, 600, -300]}
        self.assertEqual(hermite_position(left, right, start + timedelta(seconds=5)), [125, 250, -125])


if __name__ == '__main__':
    unittest.main()
