// Stub json/json.h for RawrXD build
// Minimal implementation to satisfy AdapterRegistry compilation

#pragma once

#include <string>
#include <vector>
#include <map>
#include <sstream>

namespace Json {

using UInt64 = unsigned long long;
using Int64 = long long;

class Value {
public:
    enum Type {
        nullType = 0,
        intType,
        uintType,
        realType,
        stringType,
        booleanType,
        arrayType,
        objectType
    };

    // Static constants for compatibility - these are the enum values used in code
    static const Type nullValue = nullType;
    static const Type intValue = intType;
    static const Type uintValue = uintType;
    static const Type realValue = realType;
    static const Type stringValue = stringType;
    static const Type booleanValue = booleanType;
    static const Type arrayValue = arrayType;
    static const Type objectValue = objectType;

    Value() : type_(nullType) {}
    explicit Value(Type type) : type_(type) {}
    Value(const char* value) : type_(stringType), stringValue_(value ? value : "") {}
    Value(const std::string& value) : type_(stringType), stringValue_(value) {}
    Value(int value) : type_(intType), intValue_(value) {}
    Value(unsigned int value) : type_(uintType), uintValue_(value) {}
    Value(UInt64 value) : type_(uintType), uintValue_(static_cast<unsigned int>(value)) {}
    Value(double value) : type_(realType), realValue_(value) {}
    Value(bool value) : type_(booleanType), boolValue_(value) {}

    // Assignment operators
    Value& operator=(const Value& other) {
        if (this != &other) {
            type_ = other.type_;
            stringValue_ = other.stringValue_;
            intValue_ = other.intValue_;
            uintValue_ = other.uintValue_;
            realValue_ = other.realValue_;
            boolValue_ = other.boolValue_;
            arrayValue_ = other.arrayValue_;
            objectValue_ = other.objectValue_;
        }
        return *this;
    }

    // Subscript operators
    Value& operator[](const char* key) {
        if (type_ != objectType) {
            type_ = objectType;
            objectValue_.clear();
        }
        return objectValue_[key];
    }

    Value& operator[](const std::string& key) {
        return (*this)[key.c_str()];
    }

    Value& operator[](unsigned int index) {
        if (type_ != arrayType) {
            type_ = arrayType;
            arrayValue_.clear();
        }
        if (index >= arrayValue_.size()) {
            arrayValue_.resize(index + 1);
        }
        return arrayValue_[index];
    }

    // Append for arrays
    void append(const Value& value) {
        if (type_ != arrayType) {
            type_ = arrayType;
            arrayValue_.clear();
        }
        arrayValue_.push_back(value);
    }

    // Getters
    std::string asString() const {
        switch (type_) {
            case stringType: return stringValue_;
            case intType: return std::to_string(intValue_);
            case uintType: return std::to_string(uintValue_);
            case realType: return std::to_string(realValue_);
            case booleanType: return boolValue_ ? "true" : "false";
            default: return "";
        }
    }

    int asInt() const {
        switch (type_) {
            case intType: return intValue_;
            case uintType: return static_cast<int>(uintValue_);
            case realType: return static_cast<int>(realValue_);
            default: return 0;
        }
    }

    unsigned int asUInt() const {
        switch (type_) {
            case uintType: return uintValue_;
            case intType: return static_cast<unsigned int>(intValue_);
            default: return 0;
        }
    }

    UInt64 asUInt64() const {
        switch (type_) {
            case uintType: return uintValue_;
            case intType: return static_cast<UInt64>(intValue_);
            default: return 0;
        }
    }

    double asDouble() const {
        switch (type_) {
            case realType: return realValue_;
            case intType: return static_cast<double>(intValue_);
            case uintType: return static_cast<double>(uintValue_);
            default: return 0.0;
        }
    }

    bool asBool() const {
        return type_ == booleanType ? boolValue_ : false;
    }

    // Type checks
    bool isNull() const { return type_ == nullType; }
    bool isString() const { return type_ == stringType; }
    bool isInt() const { return type_ == intType; }
    bool isUInt() const { return type_ == uintType; }
    bool isDouble() const { return type_ == realType; }
    bool isBool() const { return type_ == booleanType; }
    bool isArray() const { return type_ == arrayType; }
    bool isObject() const { return type_ == objectType; }

    // Size
    size_t size() const {
        if (type_ == arrayType) return arrayValue_.size();
        if (type_ == objectType) return objectValue_.size();
        return 0;
    }

    // Iteration for arrays
    using iterator = std::vector<Value>::iterator;
    using const_iterator = std::vector<Value>::const_iterator;

    iterator begin() {
        static std::vector<Value> empty;
        return type_ == arrayType ? arrayValue_.begin() : empty.begin();
    }

    iterator end() {
        static std::vector<Value> empty;
        return type_ == arrayType ? arrayValue_.end() : empty.end();
    }

    const_iterator begin() const {
        static std::vector<Value> empty;
        return type_ == arrayType ? arrayValue_.begin() : empty.begin();
    }

    const_iterator end() const {
        static std::vector<Value> empty;
        return type_ == arrayType ? arrayValue_.end() : empty.end();
    }

private:
    Type type_;
    std::string stringValue_;
    int intValue_ = 0;
    unsigned int uintValue_ = 0;
    double realValue_ = 0.0;
    bool boolValue_ = false;
    std::vector<Value> arrayValue_;
    std::map<std::string, Value> objectValue_;
};

// Stream output
inline std::ostream& operator<<(std::ostream& os, const Value& value) {
    os << value.asString();
    return os;
}

// Reader class
class Reader {
public:
    bool parse(const std::string& document, Value& root) {
        (void)document;
        (void)root;
        return false;  // Stub: always fails
    }

    bool parse(const char* beginDoc, const char* endDoc, Value& root) {
        (void)beginDoc;
        (void)endDoc;
        (void)root;
        return false;
    }

    std::string getFormattedErrorMessages() const {
        return "JSON parsing not implemented in stub";
    }
};

// Writer classes
class FastWriter {
public:
    std::string write(const Value& root) {
        return root.asString();
    }
};

class StyledWriter {
public:
    std::string write(const Value& root) {
        return root.asString();
    }
};

} // namespace Json