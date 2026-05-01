import { dev } from 'workerskit/dev'
import pkg from '../package.json'

export default dev({ dependencies: pkg.dependencies })
