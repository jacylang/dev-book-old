const fs = require('fs')
const path = require('path')
const {
    SOURCE_PATH,
    DIST_PATH,
    INDEX_FILENAME,
} = require('./config')
const STRUCT = require('./struct')
const fileTmpl = require('./file-tmpl')
const { chdir } = require('process')

const capitalize = str => str[0].toUpperCase() + str.slice(1)

const nameFromFilename = filename => {
    let res = []

    const segments = filename.split('-')

    // Capitalize first word
    res.push(capitalize(segments[0]))

    // Lower rest words
    for (let el of segments.slice(1)) {
        res.push(el.toLowerCase())
    }

    return res.join(' ')
}

class Generator {
    async run() {
        const sourceDir = await this._processDir(SOURCE_PATH, STRUCT, null, null)
        await this._genDir(sourceDir)
    }

    async _processFile(filePath, struct, title, {navOrder, parentTitle}) {
        if (!filePath.endsWith('.md')) {
            return null
        }

        const filename = path.basename(filePath, '.md')

        if ('children' in struct) {
            throw Error(`Invalid structure: ${filePath} has children but exists as file`)
        }

        const src = fs.readFileSync(filePath, 'utf8')

        return {
            isDir: false,
            title,
            parent: parentTitle,
            src,
            navOrder,
            isIndex: filename == INDEX_FILENAME,
            relPath: path.relative(SOURCE_PATH, filePath),
        }
    }

    async _processDir(dirPath, struct, title, {navOrder, parentTitle}) {
        const children = []
        const entities = fs.readdirSync(dirPath)

        const parentSettings = {
            parentTitle: title,
            navOrder,
        }

        for (const subPath of entities) {
            const childPath = path.join(dirPath, subPath)
            const childIsDir = fs.lstatSync(childPath).isDirectory()
            const childFilename = path.basename(subPath, '.md')

            const childStruct = struct[childFilename] || {}
            const childName = childStruct.name || nameFromFilename(childFilename)

            if (childIsDir) {
                children.push(await this._processDir(childPath, childStruct, childName, parentSettings))
            } else {
                const file = await this._processFile(childPath, childStruct, childName, parentSettings)
                if (file) {
                    children.push(file)
                }
            }

            // Ignore non-markdown files
        }

        let relPath = null
        if (!title) {
            relPath = ''
        } else {
            relPath = path.relative(SOURCE_PATH, dirPath)
        }

        children.sort((lhs, rhs) => {
            const titleCmp = lhs.title.localeCompare(rhs.title)
            if (titleCmp > 0) return -1
            if (titleCmp < 0) return 1

            return 0
        })

        let i = 1
        for (const child of children) {
            if (!child.isIndex) {
                child.navOrder = i++                
            } else {
                child.navOrder = navOrder
            }
        }

        return {
            isDir: true,
            title,
            children,
            relPath,
        }
    }

    async _genDir(dir) {
        const dirPath = path.join(DIST_PATH, dir.relPath)
        if (!fs.existsSync(dirPath)) {
            // console.log(`mkdir ${dirPath}`);
            fs.mkdirSync(dirPath);
        }

        for (const child of Object.values(dir.children)) {
            this.gen(child)
        }
    }

    async _genFile(file) {
        // console.log(`file path: ${path.join(DIST_PATH, file.relPath)}`);
        fs.writeFileSync(path.join(DIST_PATH, file.relPath), fileTmpl(file), 'utf8')
    }

    async gen(entity) {
        if (entity.isDir) {
            await this._genDir(entity)
        } else {
            await this._genFile(entity)
        }
    }
}

;(async () => {
    await (new Generator).run()
})()
